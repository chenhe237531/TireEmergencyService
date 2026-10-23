/**
 * tire 模块共享工具：状态字典派生 / 时间格式化 / 超管判断 / 分页越界回退。
 * 各页面原先各自复制一份，这里收口避免文案与行为漂移。
 */
import dayjs from "dayjs";
import { computed } from "vue";
import { ORDER_STATUS, statusTag } from "@/api/tire";
import type { Paged, TicketLogItem } from "@/api/tire";
import { useUserStoreHook } from "@/store/modules/user";

/** el-tag 的 type 是字面量联合，字典值是 string，这里收窄一次供模板使用 */
export type TagType = "primary" | "success" | "info" | "warning" | "danger";
export const tagType = (status: string): TagType =>
  (statusTag[status] || "info") as TagType;

/** 工单状态 tab：全部 + 四个流转状态（由 ORDER_STATUS 派生，顺序即字典顺序） */
export const TICKET_TABS = [
  { value: "all", label: "全部" },
  ...Object.entries(ORDER_STATUS).map(([value, label]) => ({ value, label }))
];

/** 列表时间列：无效 / 缺失显示占位符；需要到秒的列（浏览痕迹）传自定义格式 */
export const formatTime = (value?: string | null, format = "YYYY-MM-DD HH:mm") =>
  value && dayjs(value).isValid() ? dayjs(value).format(format) : "—";

/** 是否超级管理员（删除门店 / FAQ、平台设置等仅超管可操作） */
export const useIsSuperAdmin = () =>
  computed(() => useUserStoreHook().roles.includes("super_admin"));

/** 操作流水文案：from → to，创建记录无 from */
export const logStatusText = (
  log: Pick<TicketLogItem, "fromStatus" | "toStatus">
) => {
  const from = log.fromStatus
    ? `${ORDER_STATUS[log.fromStatus] || log.fromStatus}`
    : "";
  const to = ORDER_STATUS[log.toStatus] || log.toStatus || "创建";
  return from ? `${from} → ${to}` : to;
};

/**
 * 取一页列表；处理 / 筛选后总数变小导致页码越界时，回退到最后一页再取一次。
 * 越界回写 pagination.page，外层翻页器保持一致。
 */
export async function fetchPageGuarded<T>(
  fetch: (page: number) => Promise<Paged<T>>,
  pagination: { page: number; pageSize: number }
): Promise<Paged<T>> {
  let res = await fetch(pagination.page);
  const maxPage = Math.max(1, Math.ceil(res.total / pagination.pageSize));
  if (pagination.page > maxPage) {
    pagination.page = maxPage;
    res = await fetch(maxPage);
  }
  return res;
}
