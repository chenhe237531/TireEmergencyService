<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import {
  consultDetail,
  consultHandle,
  DRIVER_ROLES,
  fileUrl,
  ORDER_STATUS,
  statusFlow,
  statusTag
} from "@/api/tire";
import type { ConsultItem } from "@/api/tire";

defineOptions({ name: "TireConsultDetailDrawer" });

const props = defineProps<{
  modelValue: boolean;
  /** 列表行 id，抽屉打开时据此拉取详情（列表项不含 driver 等字段） */
  consultId: number | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "handled"): void;
}>();

/** el-tag 的 type 是字面量联合，字典值是 string，这里收窄一次供模板使用 */
type TagType = "primary" | "success" | "info" | "warning" | "danger";
const tagType = (status: string): TagType =>
  (statusTag[status] || "info") as TagType;

const NOTE_TEMPLATES = ["已电话联系车主", "已推荐就近门店", "用户已自行处理"];

const visible = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
});

const loading = ref(false);
const loadError = ref(false);
const detail = ref<ConsultItem | null>(null);
const submitting = ref(false);
const showForm = ref(false);
const form = reactive({ status: "", note: "" });

const images = computed(() => detail.value?.images || []);
const previewList = computed(() => images.value.map(fileUrl));

const driverText = computed(() => {
  const driver = detail.value?.driver;
  if (!driver) return "未登录用户";
  const role = DRIVER_ROLES[driver.role] || "身份未完善";
  return `${driver.nickname || "未命名"} · ${driver.phone || "未留手机号"} · ${role}`;
});

const statusLabel = computed(() => {
  const status = detail.value?.status || "";
  return detail.value?.statusName || ORDER_STATUS[status] || status || "—";
});

/** 目标状态只取 statusFlow，终态时为空数组 */
const targetOptions = computed(() => {
  const flow = detail.value ? statusFlow[detail.value.status] || [] : [];
  return flow.map(value => ({ value, label: ORDER_STATUS[value] || value }));
});

const isTerminal = computed(() => targetOptions.value.length === 0);

const formatTime = (value?: string | null) =>
  value && dayjs(value).isValid()
    ? dayjs(value).format("YYYY-MM-DD HH:mm")
    : "—";

function formatCoord(lat?: number | null, lng?: number | null) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return "—";
  }
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

async function loadDetail() {
  if (!props.consultId) return;
  loading.value = true;
  loadError.value = false;
  try {
    detail.value = await consultDetail(props.consultId);
  } catch (err) {
    detail.value = null;
    loadError.value = true;
    message((err as Error).message || "工单详情加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function resetHandleForm() {
  showForm.value = false;
  submitting.value = false;
  form.status = "";
  form.note = detail.value?.note || "";
}

/** 打开时按 id 拉最新详情，避免用列表里的旧数据展示处理区 */
watch(
  () => props.modelValue,
  open => {
    if (!open) return;
    detail.value = null;
    resetHandleForm();
    loadDetail();
  }
);

function openForm() {
  if (isTerminal.value) return;
  form.status = "";
  form.note = detail.value?.note || "";
  showForm.value = true;
}

function appendTemplate(text: string) {
  const current = form.note.trim();
  if (!current) {
    form.note = text;
    return;
  }
  if (current.includes(text)) return;
  form.note = `${current}；${text}`.slice(0, 200);
}

async function handleSubmit() {
  if (!detail.value) return;
  if (!form.status) {
    message("请选择目标状态", { type: "warning" });
    return;
  }
  submitting.value = true;
  try {
    await consultHandle(detail.value.id, {
      status: form.status,
      note: form.note.trim()
    });
    message(`已更新为「${ORDER_STATUS[form.status] || form.status}」`, {
      type: "success"
    });
    showForm.value = false;
    await loadDetail();
    emit("handled");
  } catch (err) {
    // 状态冲突由后端兜底校验，原样提示
    message((err as Error).message || "处理失败", { type: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="620"
    destroy-on-close
    :title="`咨询工单详情${detail ? ` #${detail.id}` : ''}`"
  >
    <div v-loading="loading" class="min-h-[240px]">
      <template v-if="detail">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span
            class="text-lg font-semibold text-[var(--el-text-color-primary)]"
          >
            {{ detail.plateNo || "未填车牌" }}
          </span>
          <el-tag :type="tagType(detail.status)" effect="light">
            {{ statusLabel }}
          </el-tag>
          <span class="ml-auto text-xs text-[var(--el-text-color-secondary)]">
            提交于 {{ formatTime(detail.createdAt) }}
          </span>
        </div>

        <div
          class="mb-2 text-sm font-medium text-[var(--el-text-color-primary)]"
        >
          基础信息
        </div>
        <el-descriptions :column="2" border size="small" class="mb-4">
          <el-descriptions-item label="联系人">
            {{ detail.contactName || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">
            <a
              v-if="detail.contactPhone"
              :href="`tel:${detail.contactPhone}`"
              class="tabular-nums text-primary hover:underline"
            >
              {{ detail.contactPhone }}
            </a>
            <span v-else class="text-[var(--el-text-color-secondary)]">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="车型">
            {{ detail.carModel || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="坐标">
            <span class="tabular-nums">
              {{ formatCoord(detail.lat, detail.lng) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="位置描述" :span="2">
            {{ detail.locationDesc || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="司机账号" :span="2">
            <span
              :class="{
                'text-[var(--el-text-color-secondary)]': !detail.driver
              }"
            >
              {{ driverText }}
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <div
          class="mb-2 text-sm font-medium text-[var(--el-text-color-primary)]"
        >
          故障描述
        </div>
        <div
          class="mb-4 whitespace-pre-wrap rounded bg-[var(--el-fill-color-light)] p-3 text-sm leading-6 text-[var(--el-text-color-regular)]"
        >
          {{ detail.description || "用户未填写故障描述" }}
        </div>

        <div
          class="mb-2 text-sm font-medium text-[var(--el-text-color-primary)]"
        >
          现场图片
          <span
            v-if="images.length"
            class="ml-1 text-xs font-normal tabular-nums text-[var(--el-text-color-secondary)]"
          >
            {{ images.length }} 张
          </span>
        </div>
        <div
          v-if="images.length"
          class="mb-4 grid grid-cols-[repeat(3,100px)] gap-2"
        >
          <el-image
            v-for="(img, index) in images"
            :key="`${img}-${index}`"
            :src="fileUrl(img)"
            :preview-src-list="previewList"
            :initial-index="index"
            fit="cover"
            preview-teleported
            class="h-[100px] w-[100px] cursor-zoom-in rounded bg-[var(--el-fill-color-light)]"
          />
        </div>
        <div
          v-else
          class="mb-4 rounded bg-[var(--el-fill-color-light)] p-3 text-sm text-[var(--el-text-color-secondary)]"
        >
          用户未上传图片
        </div>

        <div class="mt-5 border-t border-[var(--el-border-color-lighter)] pt-4">
          <div class="mb-3 flex-bc">
            <div
              class="text-sm font-medium text-[var(--el-text-color-primary)]"
            >
              处理记录
            </div>
            <el-button
              v-if="!showForm"
              type="primary"
              size="small"
              :disabled="isTerminal"
              @click="openForm"
            >
              处理
            </el-button>
          </div>

          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="当前状态">
              <el-tag :type="tagType(detail.status)" effect="light">
                {{ statusLabel }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="处理人">
              {{ detail.handledBy || "—" }}
            </el-descriptions-item>
            <el-descriptions-item label="处理时间">
              {{ formatTime(detail.handledAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="跟进备注">
              {{ detail.note || "—" }}
            </el-descriptions-item>
          </el-descriptions>

          <el-alert
            v-if="isTerminal"
            class="mt-3"
            type="info"
            :closable="false"
            show-icon
            :title="`该工单已是「${statusLabel}」，不可再变更`"
          />

          <div v-if="showForm" class="mt-4">
            <el-form label-width="80px" @submit.prevent="handleSubmit">
              <el-form-item label="目标状态" required>
                <el-select
                  v-model="form.status"
                  class="w-full"
                  placeholder="请选择目标状态"
                >
                  <el-option
                    v-for="item in targetOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="跟进备注">
                <el-input
                  v-model="form.note"
                  type="textarea"
                  :rows="3"
                  maxlength="200"
                  show-word-limit
                  placeholder="记录本次电话跟进结果"
                />
              </el-form-item>
              <el-form-item label="快捷话术">
                <div class="flex flex-wrap gap-2">
                  <el-button
                    v-for="text in NOTE_TEMPLATES"
                    :key="text"
                    size="small"
                    round
                    @click="appendTemplate(text)"
                  >
                    {{ text }}
                  </el-button>
                </div>
              </el-form-item>
              <el-form-item>
                <el-button :disabled="submitting" @click="showForm = false">
                  取消
                </el-button>
                <el-button
                  type="primary"
                  :loading="submitting"
                  @click="handleSubmit"
                >
                  提交处理
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </template>

      <el-empty
        v-else-if="loadError"
        description="工单详情加载失败，请关闭后重试"
      />
    </div>
  </el-drawer>
</template>
