<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { message } from "@/utils/message";
import type { FormInstance, FormRules } from "element-plus";
import { faqCreate, faqUpdate } from "@/api/tire";
import type { FaqItem } from "@/api/tire";

defineOptions({ name: "TireFaqFormDialog" });

const props = defineProps<{
  modelValue: boolean;
  /** 传入 FAQ 表示编辑，null 表示新增 */
  row: FaqItem | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "saved"): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const visible = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
});
const isEdit = computed(() => Boolean(props.row));

interface FaqForm {
  question: string;
  answer: string;
  sort: number;
}

const emptyForm = (): FaqForm => ({ question: "", answer: "", sort: 0 });
const form = reactive<FaqForm>(emptyForm());

/** 只输入空白字符时 required 会放行，这里再兜一层，避免存进空白问题 */
const notBlank = (label: string) => ({
  validator: (
    _rule: unknown,
    value: unknown,
    callback: (error?: Error) => void
  ) => {
    if (!String(value ?? "").trim())
      return callback(new Error(`请输入${label}`));
    callback();
  },
  trigger: "blur"
});

const rules: FormRules = {
  question: [
    { required: true, message: "请输入问题", trigger: "blur" },
    notBlank("问题")
  ],
  answer: [
    { required: true, message: "请输入答案", trigger: "blur" },
    notBlank("答案")
  ]
};

watch(
  () => props.modelValue,
  open => {
    if (!open) return;
    Object.assign(
      form,
      props.row
        ? {
            question: props.row.question || "",
            answer: props.row.answer || "",
            sort: Number(props.row.sort) || 0
          }
        : emptyForm()
    );
    nextTick(() => formRef.value?.clearValidate());
  }
);

async function handleSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  const payload = {
    question: form.question.trim(),
    answer: form.answer.trim(),
    sort: Math.trunc(form.sort ?? 0)
  };

  submitting.value = true;
  try {
    if (props.row) {
      await faqUpdate(props.row.id, payload);
    } else {
      await faqCreate(payload);
    }
    message(props.row ? "问题已更新" : "问题已新增", { type: "success" });
    visible.value = false;
    emit("saved");
  } catch (err) {
    // 失败保持弹窗打开，便于直接修改后重试
    message((err as Error).message || "保存失败", { type: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑问题' : '新增问题'"
    width="640px"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      @submit.prevent
    >
      <el-form-item label="问题" prop="question">
        <el-input
          v-model="form.question"
          maxlength="100"
          show-word-limit
          clearable
          placeholder="如：服务如何付费？"
        />
      </el-form-item>

      <el-form-item label="答案" prop="answer">
        <el-input
          v-model="form.answer"
          type="textarea"
          :rows="6"
          maxlength="1000"
          show-word-limit
          placeholder="面向司机的解答，建议分段书写，150 字以内更易读"
        />
      </el-form-item>

      <el-form-item label="排序值">
        <div class="flex items-center gap-3">
          <el-input-number
            v-model="form.sort"
            class="w-[160px]!"
            :step="1"
            :precision="0"
            controls-position="right"
          />
          <span class="text-xs text-text_color_regular">越大越靠前</span>
        </div>
      </el-form-item>
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
