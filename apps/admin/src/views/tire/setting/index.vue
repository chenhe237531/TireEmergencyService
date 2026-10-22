<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { onBeforeRouteLeave } from "vue-router";
import { ElMessageBox } from "element-plus";
import type {
  FormInstance,
  FormRules,
  UploadRequestOptions
} from "element-plus";
import IconUpload from "~icons/tabler/upload";
import IconRefresh from "~icons/tabler/refresh";
import IconQrcode from "~icons/tabler/qrcode";
import { message } from "@/utils/message";
import { fileUrl, getSettings, saveSettings, uploadImage } from "@/api/tire";
import type { PlatformSettings } from "@/api/tire";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "TireSetting" });

/** 平台设置属于全局配置，仅超级管理员可改；运营进入为只读 */
const canEdit = computed(() =>
  useUserStoreHook().roles.includes("super_admin")
);

/** 客服二维码体积上限，与后端上传接口保持一致 */
const MAX_QR_SIZE = 2 * 1024 * 1024;
/** 手机号 11 位，或 400/800 客服电话（连字符可省略），如 400-100-8666 */
const PHONE_PATTERN = /^(1[3-9]\d{9}|(400|800)-?\d{3}-?\d{4})$/;

interface SettingForm {
  servicePhone: string;
  wechatQr: string;
  shareTitle: string;
  about: string;
  userAgreement: string;
  privacyPolicy: string;
}

/** 接口字段可能缺失，统一兜底成空串，避免 el-input 出现 undefined */
const toForm = (data?: PlatformSettings): SettingForm => ({
  servicePhone: data?.servicePhone || "",
  wechatQr: data?.wechatQr || "",
  shareTitle: data?.shareTitle || "",
  about: data?.about || "",
  userAgreement: data?.userAgreement || "",
  privacyPolicy: data?.privacyPolicy || ""
});

const form = reactive<SettingForm>(toForm());
const formRef = ref<FormInstance>();
const loading = ref(false);
const submitting = ref(false);
const uploading = ref(false);
const loadError = ref("");
/** 前端记录最近一次保存时间，仅用于提示，不参与业务 */
const savedAt = ref("");

/** 服务端数据快照：与当前表单做对比来判断「有未保存的修改」，撤销输入后能自动回到干净态 */
const snapshot = ref(JSON.stringify(toForm()));
const isDirty = computed(() => JSON.stringify(form) !== snapshot.value);

const phoneValidator = (
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void
) => {
  const phone = String(value ?? "").trim();
  if (!phone) return callback(new Error("请输入客服电话"));
  if (!PHONE_PATTERN.test(phone)) {
    return callback(
      new Error("请输入手机号或 400/800 客服电话，如 400-100-8666")
    );
  }
  callback();
};

const rules: FormRules = {
  servicePhone: [
    { required: true, message: "请输入客服电话", trigger: "blur" },
    { validator: phoneValidator, trigger: "blur" }
  ]
};

async function loadSettings() {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await getSettings();
    Object.assign(form, toForm(res));
    snapshot.value = JSON.stringify(form);
    await nextTick();
    formRef.value?.clearValidate();
  } catch (err) {
    loadError.value = (err as Error).message || "平台设置加载失败";
    message(loadError.value, { type: "error" });
  } finally {
    loading.value = false;
  }
}

/** 重置：放弃本地修改，重新拉取服务端设置 */
async function handleReset() {
  savedAt.value = "";
  await loadSettings();
}

async function handleSave() {
  if (!formRef.value || submitting.value || uploading.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    await saveSettings({
      servicePhone: form.servicePhone.trim(),
      wechatQr: form.wechatQr,
      shareTitle: form.shareTitle.trim(),
      about: form.about,
      userAgreement: form.userAgreement,
      privacyPolicy: form.privacyPolicy
    });
    // 用提交后的值重建快照，清掉脏标记，避免离开时误提示
    form.servicePhone = form.servicePhone.trim();
    form.shareTitle = form.shareTitle.trim();
    snapshot.value = JSON.stringify(form);
    savedAt.value = dayjs().format("YYYY-MM-DD HH:mm");
    message("保存成功", { type: "success" });
  } catch (err) {
    message((err as Error).message || "保存失败，请稍后重试", {
      type: "error"
    });
  } finally {
    submitting.value = false;
  }
}

/**
 * el-upload 自定义上传：校验格式与体积后调 uploadImage，
 * 成功后把返回的 url 写进表单（保存设置时才落库）。
 */
function handleUpload(options: UploadRequestOptions) {
  const file = options.file;
  const typeAllowed =
    ["image/png", "image/jpeg"].includes(file.type) ||
    /\.(png|jpe?g)$/i.test(file.name);
  if (!typeAllowed) {
    message("二维码仅支持 PNG / JPG 格式的图片", { type: "error" });
    return Promise.reject(new Error("二维码格式不支持"));
  }
  if (file.size > MAX_QR_SIZE) {
    message("图片大小不能超过 2MB，请压缩后重新上传", { type: "error" });
    return Promise.reject(new Error("二维码图片过大"));
  }

  uploading.value = true;
  return uploadImage(file)
    .then(res => {
      form.wechatQr = res.url || "";
      message("二维码上传成功，点击「保存设置」后生效", { type: "success" });
    })
    .catch((err: Error) => {
      message(err.message || "二维码上传失败", { type: "error" });
      // 继续抛出，让 el-upload 把本次上传标记为失败
      throw err;
    })
    .finally(() => {
      uploading.value = false;
    });
}

/** 删除只清空表单值，仍需点保存才会同步到端上（需求明确不弹二次确认） */
function handleRemoveQr() {
  form.wechatQr = "";
  message("二维码已移除，保存后小程序端将不再展示", { type: "info" });
}

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true;
  try {
    await ElMessageBox.confirm("有未保存的修改，确定离开？", "未保存的修改", {
      type: "warning",
      confirmButtonText: "确定离开",
      cancelButtonText: "留在本页"
    });
    return true;
  } catch {
    return false;
  }
});

/** 直接刷新/关闭标签页时也提示未保存，避免只在路由切换时拦截 */
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

// keepAlive 页面：首次由 onMounted 加载，之后切回时再拉一次最新配置
let skipFirstActivated = true;
onMounted(() => {
  loadSettings();
  window.addEventListener("beforeunload", onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});
onActivated(() => {
  if (skipFirstActivated) {
    skipFirstActivated = false;
    return;
  }
  // 兜底：极端情况下带着未保存修改回到页面时，不覆盖用户输入
  if (!isDirty.value) loadSettings();
});
</script>

<template>
  <div v-loading="loading" class="p-2">
    <el-alert
      class="mb-3"
      type="info"
      show-icon
      :closable="false"
      title="这里维护的是小程序端「我的 - 联系客服 / 关于我们 / 用户协议 / 隐私政策 / 常见问题」展示的内容，修改后需保存才会生效。"
    />
    <el-alert
      v-if="!canEdit"
      class="mb-3"
      type="warning"
      show-icon
      :closable="false"
      title="平台设置仅超级管理员可修改，当前为只读模式。"
    />

    <el-card v-if="loadError" shadow="never">
      <el-empty :description="loadError">
        <el-button type="primary" :icon="IconRefresh" @click="loadSettings">
          重试
        </el-button>
      </el-empty>
    </el-card>

    <template v-else>
      <el-form
        ref="formRef"
        class="max-w-[820px]"
        :model="form"
        :rules="rules"
        label-width="110px"
        :disabled="!canEdit"
        @submit.prevent
      >
        <el-card shadow="never" class="mb-3">
          <template #header>
            <div class="font-medium">客服信息</div>
          </template>

          <el-form-item label="客服电话" prop="servicePhone">
            <el-input
              v-model="form.servicePhone"
              class="w-[300px]!"
              maxlength="20"
              clearable
              placeholder="手机号或 400/800 客服电话，如 400-100-8666"
            />
          </el-form-item>

          <el-form-item label="客服二维码">
            <div class="flex items-start gap-4">
              <el-image
                v-if="form.wechatQr"
                :src="fileUrl(form.wechatQr)"
                :preview-src-list="[fileUrl(form.wechatQr)]"
                preview-teleported
                fit="contain"
                class="h-[120px] w-[120px] shrink-0 rounded border border-[var(--el-border-color)] bg-white"
              />
              <div
                v-else
                class="flex h-[120px] w-[120px] shrink-0 flex-col items-center justify-center gap-1 rounded border border-dashed border-[var(--el-border-color)] text-xs text-text_color_regular"
              >
                <el-icon :size="22"><IconQrcode /></el-icon>
                <span>未上传二维码</span>
              </div>

              <div class="flex flex-col items-start gap-2">
                <div class="flex items-center gap-2">
                  <el-upload
                    v-if="canEdit"
                    :show-file-list="false"
                    :http-request="handleUpload"
                    :disabled="uploading"
                    accept="image/png,image/jpeg"
                  >
                    <el-button :icon="IconUpload" :loading="uploading">
                      {{ form.wechatQr ? "重新上传" : "上传二维码" }}
                    </el-button>
                  </el-upload>
                  <el-button
                    v-if="form.wechatQr && canEdit"
                    type="danger"
                    link
                    @click="handleRemoveQr"
                  >
                    删除
                  </el-button>
                </div>
                <div class="text-xs leading-5 text-text_color_regular">
                  <div>
                    仅支持 PNG / JPG，大小不超过 2MB，建议使用方形图片。
                  </div>
                  <div v-if="form.wechatQr">删除后小程序端将不展示二维码。</div>
                  <div v-else>上传后需点「保存设置」才会在小程序端生效。</div>
                </div>
              </div>
            </div>
          </el-form-item>
        </el-card>

        <el-card shadow="never" class="mb-3">
          <template #header>
            <div class="font-medium">分享与文案</div>
          </template>

          <el-form-item label="分享标题">
            <el-input
              v-model="form.shareTitle"
              maxlength="60"
              show-word-limit
              clearable
              placeholder="小程序分享给好友时展示的标题"
            />
          </el-form-item>

          <el-form-item label="关于我们">
            <el-input
              v-model="form.about"
              type="textarea"
              :rows="4"
              maxlength="500"
              show-word-limit
              placeholder="介绍平台的服务范围与承诺，展示在「我的 - 关于我们」"
            />
          </el-form-item>
        </el-card>

        <el-card shadow="never" class="mb-3">
          <template #header>
            <div class="font-medium">协议文档</div>
          </template>

          <el-form-item label="用户协议">
            <div class="w-full">
              <el-input
                v-model="form.userAgreement"
                type="textarea"
                :rows="10"
                placeholder="展示在「我的 - 用户协议」，请分段书写"
              />
              <div
                class="mt-1 flex-bc text-xs leading-5 text-text_color_regular"
              >
                <span>换行会原样展示在端上，请用回车分段。</span>
                <span class="tabular-nums">
                  共 {{ form.userAgreement.length }} 字
                </span>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="隐私政策">
            <div class="w-full">
              <el-input
                v-model="form.privacyPolicy"
                type="textarea"
                :rows="10"
                placeholder="展示在「我的 - 隐私政策」，请分段书写"
              />
              <div
                class="mt-1 flex-bc text-xs leading-5 text-text_color_regular"
              >
                <span>换行会原样展示在端上，请用回车分段。</span>
                <span class="tabular-nums">
                  共 {{ form.privacyPolicy.length }} 字
                </span>
              </div>
            </div>
          </el-form-item>
        </el-card>
      </el-form>

      <!-- 底部操作卡片：页面内容较长，操作统一放在最后一屏，样式与上方卡片保持一致 -->
      <el-card shadow="never">
        <div class="flex-bc">
          <div class="text-xs text-text_color_regular">
            <template v-if="isDirty">
              <span class="text-[var(--el-color-warning)]">有未保存的修改</span>
              <span class="mx-1">·</span>
              <span>保存后才会同步到小程序端</span>
            </template>
            <template v-else>
              {{ savedAt ? `最后保存：${savedAt}` : "修改后请点击保存" }}
            </template>
          </div>
          <!-- 右侧留白避开布局右下角的「回到顶部」悬浮按钮，防止遮挡保存按钮 -->
          <div v-if="canEdit" class="flex gap-2 pr-9">
            <el-button
              :icon="IconRefresh"
              :loading="loading"
              :disabled="submitting || uploading"
              @click="handleReset"
            >
              重置
            </el-button>
            <el-button
              type="primary"
              :loading="submitting"
              :disabled="uploading"
              @click="handleSave"
            >
              保存设置
            </el-button>
          </div>
          <span v-else class="pr-9 text-xs text-[var(--el-text-color-secondary)]">
            只读模式
          </span>
        </div>
      </el-card>
    </template>
  </div>
</template>
