<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { message } from "@/utils/message";
import type { FormInstance, FormRules } from "element-plus";
import { STORE_CATEGORIES, storeCreate, storeUpdate } from "@/api/tire";
import type { StoreItem } from "@/api/tire";

defineOptions({ name: "TireStoreFormDialog" });

const props = defineProps<{
  modelValue: boolean;
  /** 传入门店表示编辑，null 表示新增 */
  row: StoreItem | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "saved", mode: "create" | "edit", row: StoreItem): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const isEdit = computed(() => Boolean(props.row));

const visible = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
});

const categoryOptions = Object.entries(STORE_CATEGORIES).map(
  ([value, label]) => ({ value, label })
);

interface StoreForm {
  name: string;
  category: string;
  mainServices: string;
  score: number | undefined;
  lat: number | undefined;
  lng: number | undefined;
  address: string;
  phone: string;
  contactName: string;
  areaLabel: string;
  sort: number;
  status: string;
}

const emptyForm = (): StoreForm => ({
  name: "",
  category: "",
  mainServices: "",
  score: 5,
  lat: undefined,
  lng: undefined,
  address: "",
  phone: "",
  contactName: "",
  areaLabel: "",
  sort: 0,
  status: "active"
});

const form = reactive<StoreForm>(emptyForm());

/** 回显：门店数据转表单值，空值统一转成空串，避免 el-input 显示 undefined */
const toForm = (row: StoreItem): StoreForm => ({
  name: row.name || "",
  category: row.category || "",
  mainServices: row.mainServices || "",
  score: Number(row.score) || 0,
  lat: Number(row.lat),
  lng: Number(row.lng),
  address: row.address || "",
  phone: row.phone || "",
  contactName: row.contactName || "",
  areaLabel: row.areaLabel || "",
  sort: Number(row.sort) || 0,
  status: row.status || "active"
});

/**
 * 经纬度校验器：空值交给 required 规则报「请输入」，这里只处理非数字与越界，
 * 越界文案要带上区间，方便运营知道有效范围。
 */
const coordValidator = (label: string, min: number, max: number) => {
  return (
    _rule: unknown,
    value: unknown,
    callback: (error?: Error) => void
  ) => {
    if (value === undefined || value === null || value === "")
      return callback();
    const num = Number(value);
    if (Number.isNaN(num)) return callback(new Error(`${label}必须是数字`));
    if (num < min || num > max)
      return callback(new Error(`${label}需在 ${min} ~ ${max} 之间`));
    callback();
  };
};

const rules: FormRules = {
  name: [
    { required: true, message: "请输入门店名称", trigger: "blur" },
    { min: 2, max: 40, message: "门店名称需为 2 ~ 40 个字", trigger: "blur" }
  ],
  category: [{ required: true, message: "请选择门店分类", trigger: "change" }],
  lat: [
    { required: true, message: "请输入纬度", trigger: ["blur", "change"] },
    { validator: coordValidator("纬度", -90, 90), trigger: ["blur", "change"] }
  ],
  lng: [
    { required: true, message: "请输入经度", trigger: ["blur", "change"] },
    {
      validator: coordValidator("经度", -180, 180),
      trigger: ["blur", "change"]
    }
  ]
};

/** 打开弹窗时重置/回显表单，并清掉上一次的校验红字 */
watch(
  () => props.modelValue,
  open => {
    if (!open) return;
    Object.assign(form, props.row ? toForm(props.row) : emptyForm());
    nextTick(() => formRef.value?.clearValidate());
  }
);

/** 提交前兜底校验：el-input-number 被清空或手输越界时，规则可能没触发，这里再拦一次 */
function coordError(): string | null {
  if (form.lat === undefined || form.lat === null) return "请输入纬度";
  if (form.lng === undefined || form.lng === null) return "请输入经度";
  if (!Number.isFinite(Number(form.lat))) return "纬度必须是数字";
  if (!Number.isFinite(Number(form.lng))) return "经度必须是数字";
  if (Number(form.lat) < -90 || Number(form.lat) > 90)
    return "纬度需在 -90 ~ 90 之间";
  if (Number(form.lng) < -180 || Number(form.lng) > 180)
    return "经度需在 -180 ~ 180 之间";
  return null;
}

async function handleSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  const error = coordError();
  if (error) {
    message(error, { type: "error" });
    return;
  }

  const payload = {
    name: form.name.trim(),
    category: form.category,
    mainServices: form.mainServices.trim(),
    score: form.score ?? 5,
    lat: Number(form.lat),
    lng: Number(form.lng),
    address: form.address.trim(),
    phone: form.phone.trim(),
    contactName: form.contactName.trim(),
    areaLabel: form.areaLabel.trim(),
    sort: Math.trunc(form.sort ?? 0),
    status: form.status || "active"
  };

  submitting.value = true;
  try {
    const saved = props.row
      ? await storeUpdate(props.row.id, payload)
      : // 新增的门店默认展示中
        await storeCreate({ ...payload, status: "active" });
    message(props.row ? "门店信息已更新" : "门店创建成功", { type: "success" });
    visible.value = false;
    emit("saved", props.row ? "edit" : "create", saved);
  } catch (err) {
    // 失败保持弹窗打开，运营可直接修改后重试
    message((err as Error).message || "保存失败", { type: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑门店' : '新增门店'"
    width="720px"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
  >
    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="完整地址、联系电话、联系人仅后台可见，端上只展示模糊区域"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="96px"
      @submit.prevent
    >
      <el-row :gutter="16">
        <el-col :span="24">
          <el-form-item label="门店名称" prop="name">
            <el-input
              v-model="form.name"
              maxlength="40"
              show-word-limit
              clearable
              placeholder="请输入门店名称（2 ~ 40 字）"
            />
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item label="门店分类" prop="category">
            <el-select
              v-model="form.category"
              class="w-full"
              placeholder="请选择分类"
            >
              <el-option
                v-for="item in categoryOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="评分">
            <el-input-number
              v-model="form.score"
              class="w-full"
              :min="0"
              :max="5"
              :step="0.1"
              :precision="1"
              controls-position="right"
            />
          </el-form-item>
        </el-col>

        <el-col :span="24">
          <el-form-item label="主营项目">
            <el-input
              v-model="form.mainServices"
              maxlength="60"
              clearable
              placeholder="大车补胎、换胎、24 小时流动补胎"
            />
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item label="纬度" prop="lat">
            <el-input-number
              v-model="form.lat"
              class="w-full"
              :precision="6"
              :step="0.000001"
              controls-position="right"
              placeholder="-90 ~ 90"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="经度" prop="lng">
            <el-input-number
              v-model="form.lng"
              class="w-full"
              :precision="6"
              :step="0.000001"
              controls-position="right"
              placeholder="-180 ~ 180"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 坐标输入提示：mt-2 留出空间，避免与 el-form-item 的绝对定位错误文案重叠 -->
      <div class="mt-2 mb-4 pl-24 text-xs leading-4 text-text_color_regular">
        可在坐标拾取器网站（如 lbs.qq.com/getPoint）取点后粘贴
      </div>

      <el-row :gutter="16">
        <el-col :span="24">
          <el-form-item label="完整地址">
            <el-input
              v-model="form.address"
              maxlength="120"
              clearable
              placeholder="仅后台可见，如：成都市高新区天府大道中段 1 号"
            />
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item label="联系电话">
            <el-input
              v-model="form.phone"
              maxlength="30"
              clearable
              placeholder="仅后台可见"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系人">
            <el-input
              v-model="form.contactName"
              maxlength="20"
              clearable
              placeholder="仅后台可见"
            />
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item label="模糊区域">
            <el-input
              v-model="form.areaLabel"
              maxlength="20"
              clearable
              placeholder="高新区"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="排序权重">
            <el-input-number
              v-model="form.sort"
              class="w-full"
              :step="1"
              :precision="0"
              controls-position="right"
            />
          </el-form-item>
        </el-col>

        <el-col v-if="isEdit" :span="12">
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio-button value="active">展示中</el-radio-button>
              <el-radio-button value="hidden">已隐藏</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false"
        >取消</el-button
      >
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
