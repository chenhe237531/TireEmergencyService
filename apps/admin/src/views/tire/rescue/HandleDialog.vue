<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import {
  ORDER_STATUS,
  rescueDetail,
  rescueHandle,
  rescueNearbyStores,
  statusFlow,
  statusTag
} from "@/api/tire";
import type {
  NearbyStoreItem,
  RescueDetail,
  RescueItem,
  TicketLogItem
} from "@/api/tire";
import IconCopy from "~icons/tabler/copy";

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
const loadingDetail = ref(false);
const loadingNearby = ref(false);
const detail = ref<RescueDetail | null>(null);
const nearby = ref<NearbyStoreItem[]>([]);
const form = reactive<{ status: string; note: string; assignedStoreId: number | null }>({
  status: "",
  note: "",
  assignedStoreId: null
});

/** 可选目标状态只认后端约定的 statusFlow，避免前端臆造流转路径 */
const targetOptions = computed(() => {
  const status = detail.value?.status || props.row?.status || "";
  return (statusFlow[status] || []).map(value => ({
    value,
    label: ORDER_STATUS[value] || value
  }));
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

function copyPhone(phone: string) {
  if (!phone) return;
  navigator.clipboard?.writeText(phone);
  message("门店电话已复制", { type: "success" });
}

/** 每次打开都重新拉详情与附近门店：派单依据要使用最新坐标和门店状态 */
watch(
  () => props.modelValue,
  async open => {
    if (!open || !props.row) return;
    form.status = "";
    form.note = props.row.note || "";
    form.assignedStoreId = props.row.assignedStoreId ?? null;
    detail.value = null;
    nearby.value = [];

    loadingDetail.value = true;
    loadingNearby.value = true;
    const [detailRes, nearbyRes] = await Promise.allSettled([
      rescueDetail(props.row.id),
      rescueNearbyStores(props.row.id)
    ]);
    if (detailRes.status === "fulfilled") {
      detail.value = detailRes.value;
      form.note = detailRes.value.note || form.note;
      form.assignedStoreId = detailRes.value.assignedStoreId ?? null;
    } else {
      message((detailRes.reason as Error)?.message || "工单详情加载失败", {
        type: "error"
      });
    }
    if (nearbyRes.status === "fulfilled") {
      nearby.value = nearbyRes.value;
    } else {
      message((nearbyRes.reason as Error)?.message || "附近门店加载失败", {
        type: "error"
      });
    }
    loadingDetail.value = false;
    loadingNearby.value = false;
  }
);

function appendTemplate(text: string) {
  const current = form.note.trim();
  if (!current) {
    form.note = text;
    return;
  }
  if (current.includes(text)) return;
  form.note = `${current}；${text}`.slice(0, 500);
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
      note: form.note.trim(),
      assignedStoreId: form.assignedStoreId
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

const logStatus = (log: TicketLogItem) => {
  const from = log.fromStatus ? `${ORDER_STATUS[log.fromStatus] || log.fromStatus}` : "";
  const to = ORDER_STATUS[log.toStatus] || log.toStatus || "创建";
  return from ? `${from} → ${to}` : to;
};
</script>

<template>
  <el-dialog
    v-model="visible"
    title="处理救援通知"
    width="760px"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
  >
    <div v-loading="loadingDetail">
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
          <el-descriptions-item label="车型 / 车牌">
            {{ row.vehicleTypeName || "其他" }}
            <span v-if="row.plateNo" class="ml-1 tabular-nums text-[var(--el-text-color-secondary)]">
              {{ row.plateNo }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="当前位置">
            {{ row.locationDesc || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="坐标" :span="2">
            <span class="tabular-nums text-xs">
              {{
                row.lat != null && row.lng != null
                  ? `${Number(row.lat).toFixed(5)}, ${Number(row.lng).toFixed(5)}`
                  : "—"
              }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="当前状态" :span="2">
            <el-tag :type="tagType(row.status)" effect="light">
              {{ row.statusName || ORDER_STATUS[row.status] || row.status }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 附近门店：按车型过滤 + 按距离排序，直接复制电话联系门店 -->
        <div class="mb-4">
          <div class="mb-1.5 text-sm font-medium">指派门店</div>
          <div class="w-full">
            <el-select
              v-model="form.assignedStoreId"
              class="w-full"
              clearable
              placeholder="选择本次派单门店（可稍后指派）"
              :loading="loadingNearby"
              @clear="form.assignedStoreId = null"
            >
              <el-option :value="null" label="不指派门店" />
              <el-option
                v-for="store in nearby"
                :key="store.id"
                :value="store.id"
                :label="`${store.name} · ${store.distanceLabel} · ${store.phone}`"
              />
            </el-select>

            <div
              v-if="loadingNearby"
              class="mt-2 text-xs text-[var(--el-text-color-secondary)]"
            >
              正在按车型匹配附近门店…
            </div>
            <div
              v-else-if="!nearby.length"
              class="mt-2 text-xs text-[var(--el-text-color-secondary)]"
            >
              {{ row.lat == null || row.lng == null
                ? "司机未提供坐标，暂无法推荐附近门店，可按位置描述人工联系。"
                : "附近暂无匹配门店，可稍后再试或人工联系门店。" }}
            </div>
            <div v-else class="mt-2 overflow-hidden rounded-lg border border-[var(--el-border-color-lighter)]">
              <div
                v-for="store in nearby"
                :key="store.id"
                class="flex items-center justify-between gap-3 border-b border-[var(--el-border-color-lighter)] px-3 py-2 last:border-b-0"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ store.name }}</span>
                    <el-tag size="small" effect="plain">{{ store.categoryName }}</el-tag>
                    <span class="text-xs text-primary">{{ store.distanceLabel }}</span>
                  </div>
                  <div class="mt-0.5 truncate text-xs text-[var(--el-text-color-secondary)]">
                    {{ store.areaLabel }} · {{ store.address || "地址待补充" }}
                    <span class="ml-2 tabular-nums">{{ store.phone }}</span>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    :icon="IconCopy"
                    @click="copyPhone(store.phone)"
                  >
                    复制电话
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <el-form label-width="88px" class="mt-4" @submit.prevent="handleSubmit">
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
              maxlength="500"
              show-word-limit
              placeholder="记录本次电话跟进结果、派单门店与司机反馈"
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

        <div v-if="detail?.logs?.length" class="mt-2">
          <div class="mb-2 text-sm font-medium">操作流水</div>
          <el-timeline>
            <el-timeline-item
              v-for="log in detail.logs"
              :key="log.id"
              :timestamp="formatTime(log.createdAt)"
              placement="top"
            >
              <div class="text-sm font-medium">{{ logStatus(log) }}</div>
              <div class="mt-0.5 text-xs text-[var(--el-text-color-secondary)]">
                {{ log.operatorName || "系统" }}{{ log.note ? ` · ${log.note}` : "" }}
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="isTerminal || loadingDetail"
        @click="handleSubmit"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
