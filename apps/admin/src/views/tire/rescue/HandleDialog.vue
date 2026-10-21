<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { ORDER_STATUS, rescueHandle, statusFlow, statusTag } from "@/api/tire";
import type { RescueItem } from "@/api/tire";

defineOptions({ name: "TireRescueHandleDialog" });

const props = defineProps<{
  modelValue: boolean;
  /** 当前要处理的救援通知，null 表示未选中 */
  row: RescueItem | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "handled"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
});

const submitting = ref(false);
const form = reactive({ status: "", note: "" });

/** 可选目标状态只认后端约定的 statusFlow，避免前端臆造流转路径 */
const targetOptions = computed(() => {
  const flow = props.row ? statusFlow[props.row.status] || [] : [];
  return flow.map(value => ({ value, label: ORDER_STATUS[value] || value }));
});

/** 无后续状态即为终态，提交按钮需禁用 */
const isTerminal = computed(() => targetOptions.value.length === 0);

const NOTE_TEMPLATES = ["已电话联系司机", "司机已自行处理", "已转门店跟进"];

/** el-tag 的 type 是字面量联合，字典值是 string，这里收窄一次供模板使用 */
type TagType = "primary" | "success" | "info" | "warning" | "danger";
const tagType = (status: string): TagType =>
  (statusTag[status] || "info") as TagType;

const formatTime = (value?: string | null) =>
  value && dayjs(value).isValid()
    ? dayjs(value).format("YYYY-MM-DD HH:mm")
    : "—";

/** 每次打开都重置表单：备注预填已有跟进记录，方便在原记录上追加 */
watch(
  () => props.modelValue,
  open => {
    if (!open) return;
    form.status = "";
    form.note = props.row?.note || "";
  }
);

function appendTemplate(text: string) {
  const current = form.note.trim();
  if (!current) {
    form.note = text;
    return;
  }
  if (current.includes(text)) return;
  // 后端备注列有长度上限，拼接后截断到 200 字，避免提交被拒
  form.note = `${current}；${text}`.slice(0, 200);
}

async function handleSubmit() {
  if (!props.row) return;
  if (!form.status) {
    message("请选择目标状态", { type: "warning" });
    return;
  }
  submitting.value = true;
  try {
    await rescueHandle(props.row.id, {
      status: form.status,
      note: form.note.trim()
    });
    message(`已更新为「${ORDER_STATUS[form.status] || form.status}」`, {
      type: "success"
    });
    visible.value = false;
    emit("handled");
  } catch (err) {
    // 状态冲突等错误由后端校验，原样提示便于运营理解
    message((err as Error).message || "处理失败", { type: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="处理救援通知"
    width="640px"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
  >
    <template v-if="row">
      <el-descriptions :column="2" border size="small" class="mb-4">
        <el-descriptions-item label="通知编号">
          <span class="font-medium tabular-nums">#{{ row.id }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="提交时间">
          {{ formatTime(row.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="司机">
          {{ row.driver?.nickname || "匿名司机" }}
        </el-descriptions-item>
        <el-descriptions-item label="联系电话">
          <span class="tabular-nums">{{ row.driverPhone || "—" }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="当前位置" :span="2">
          {{ row.locationDesc || "—" }}
        </el-descriptions-item>
        <el-descriptions-item label="当前状态" :span="2">
          <el-tag :type="tagType(row.status)" effect="light">
            {{ row.statusName || ORDER_STATUS[row.status] || row.status }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-form label-width="88px" @submit.prevent="handleSubmit">
        <el-form-item label="目标状态" required>
          <el-select
            v-model="form.status"
            class="w-full"
            :disabled="isTerminal"
            placeholder="请选择目标状态"
          >
            <el-option
              v-for="item in targetOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <div
            v-if="isTerminal"
            class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
          >
            已终态，不可再变更
          </div>
        </el-form-item>

        <el-form-item label="跟进备注">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="4"
            maxlength="200"
            show-word-limit
            placeholder="记录本次电话跟进结果，便于后续查询"
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
      </el-form>
    </template>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="isTerminal"
        @click="handleSubmit"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
