/**
 * 小蚂蚁轮胎救援 —— 后台 API 统一封装与业务字典（全部页面的接口契约）
 *
 * 约定：后端统一响应 { code, message, data }；code===0 成功返回 data；
 * code===40001 登录过期跳登录页；其余 code 抛 Error(message) 由页面 message 提示。
 */
import { http } from "@/utils/http";

async function request<T = any>(method: string, url: string, data?: any, headers?: Record<string, string>): Promise<T> {
  const res: any = await http.request(method, url, headers ? { data, headers } : { data });
  if (res.code === 40001) {
    localStorage.removeItem("tire-admin-user");
    window.location.hash = "#/login";
    throw new Error("登录已过期，请重新登录");
  }
  if (res.code !== 0) throw new Error(res.message || "请求失败");
  return res.data as T;
}

// ─── 业务字典（与后端 app.controller.ts / schema.prisma 注释一致） ───

/** 门店分类 */
export const STORE_CATEGORIES: Record<string, string> = {
  tire_big: "大车轮胎店",
  tire_small: "小车轮胎店",
  tire_both: "轮胎店（大小车）",
  repair_big: "大车修理厂",
  repair_small: "小车修理厂",
  towing: "救援拖车",
};

/** 工单状态（救援通知与咨询工单共用同一状态机） */
export const ORDER_STATUS: Record<string, string> = {
  pending: "待处理",
  contacting: "跟进中",
  resolved: "已解决",
  cancelled: "已取消",
};

/** 状态 → el-tag 类型（页面直接 :type="statusTag[row.status]"） */
export const statusTag: Record<string, string> = {
  pending: "danger",
  contacting: "warning",
  resolved: "success",
  cancelled: "info",
};

/** 司机身份 */
export const DRIVER_ROLES: Record<string, string> = {
  private_owner: "私人车主",
  fleet: "车队",
  store: "服务门店",
};

/** 状态流转合法路径（与后端 FLOW 一致，用于按钮可用性判断） */
export const statusFlow: Record<string, string[]> = {
  pending: ["contacting", "resolved", "cancelled"],
  contacting: ["resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};

// ─── 类型定义 ───

export interface StoreItem {
  id: number;
  name: string;
  category: string;
  mainServices: string;
  score: number;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  contactName: string;
  areaLabel: string;
  sort: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RescueItem {
  id: number;
  driverId?: number | null;
  driver?: { id: number; nickname: string; phone: string; role: string } | null;
  lat?: number | null;
  lng?: number | null;
  locationDesc: string;
  status: string;
  statusName: string;
  note: string;
  handledBy: string;
  handledAt?: string | null;
  createdAt: string;
  driverPhone: string;
  driverRoleName: string;
}

export interface ConsultItem {
  id: number;
  driverId?: number | null;
  plateNo: string;
  carModel: string;
  lat?: number | null;
  lng?: number | null;
  locationDesc: string;
  description: string;
  images: string[] | null;
  contactName: string;
  contactPhone: string;
  status: string;
  statusName: string;
  note: string;
  handledBy: string;
  handledAt?: string | null;
  createdAt: string;
  driver?: { id: number; nickname: string; phone: string; role: string } | null;
}

export interface DriverItem {
  id: number;
  nickname: string;
  avatarUrl: string;
  phone: string;
  role: string;
  roleName: string;
  roleEmpty: boolean;
  status: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface ViewLogItem {
  id: number;
  driver: { id: number; nickname: string; phone: string };
  store: { id: number; name: string; category: string };
  action: string;
  actionName: string;
  categoryName: string;
  createdAt: string;
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  sort: number;
  status: string;
  createdAt: string;
}

export interface DashboardStats {
  todayRescue: number;
  todayConsult: number;
  pendingRescue: number;
  pendingConsult: number;
  driverCount: number;
  storeCount: number;
  trend: { date: string; rescue: number; consult: number }[];
}

export interface Paged<T> { list: T[]; total: number; page: number; pageSize: number }

// ─── 工作台 ───

export const dashboardStats = () => request<DashboardStats>("get", "/api/v1/admin/dashboard/stats");

// ─── 门店管理 ───

export const storeList = (params?: { category?: string; status?: string; keyword?: string; page?: number; pageSize?: number }) =>
  request<Paged<StoreItem>>("get", `/api/v1/admin/stores${toQuery(params)}`);

export const storeCreate = (data: Partial<StoreItem>) =>
  request<StoreItem>("post", "/api/v1/admin/stores", data);

export const storeUpdate = (id: number, data: Partial<StoreItem>) =>
  request<StoreItem>("patch", `/api/v1/admin/stores/${id}`, data);

export const storeDelete = (id: number) =>
  request<{ ok: boolean }>("delete", `/api/v1/admin/stores/${id}`);

// ─── 救援通知 ───

export const rescueUnreadCount = () =>
  request<{ rescue: number; consult: number; total: number }>("get", "/api/v1/admin/rescue-alerts/unread-count");

export const rescueList = (params?: { status?: string; start?: string; end?: string; page?: number; pageSize?: number }) =>
  request<Paged<RescueItem>>("get", `/api/v1/admin/rescue-alerts${toQuery(params)}`);

export const rescueHandle = (id: number, data: { status?: string; note?: string }) =>
  request<RescueItem>("patch", `/api/v1/admin/rescue-alerts/${id}`, data);

// ─── 咨询工单 ───

export const consultList = (params?: { status?: string; keyword?: string; start?: string; end?: string; page?: number; pageSize?: number }) =>
  request<Paged<ConsultItem>>("get", `/api/v1/admin/consults${toQuery(params)}`);

export const consultDetail = (id: number) =>
  request<ConsultItem>("get", `/api/v1/admin/consults/${id}`);

export const consultHandle = (id: number, data: { status?: string; note?: string }) =>
  request<ConsultItem>("patch", `/api/v1/admin/consults/${id}`, data);

// ─── 司机与浏览痕迹 ───

export const driverList = (params?: { keyword?: string; role?: string; page?: number; pageSize?: number }) =>
  request<Paged<DriverItem>>("get", `/api/v1/admin/drivers${toQuery(params)}`);

export const viewLogList = (params?: { driverId?: number; storeId?: number; action?: string; start?: string; end?: string; page?: number; pageSize?: number }) =>
  request<Paged<ViewLogItem>>("get", `/api/v1/admin/view-logs${toQuery(params)}`);

// ─── 平台设置与 FAQ ───

export interface PlatformSettings {
  servicePhone?: string;
  wechatQr?: string;
  about?: string;
  userAgreement?: string;
  privacyPolicy?: string;
  shareTitle?: string;
}

export const getSettings = () => request<PlatformSettings>("get", "/api/v1/admin/settings");

export const saveSettings = (data: PlatformSettings) =>
  request<{ ok: boolean }>("patch", "/api/v1/admin/settings", data);

export const faqList = (keyword?: string) =>
  request<FaqItem[]>("get", `/api/v1/admin/faqs${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`);

export const faqCreate = (data: { question: string; answer: string; sort?: number }) =>
  request<FaqItem>("post", "/api/v1/admin/faqs", data);

export const faqUpdate = (id: number, data: Partial<FaqItem>) =>
  request<FaqItem>("patch", `/api/v1/admin/faqs/${id}`, data);

export const faqDelete = (id: number) =>
  request<{ ok: boolean }>("delete", `/api/v1/admin/faqs/${id}`);

// ─── 上传（客服二维码等图片） ───

/** 上传图片，返回 { url: '/uploads/xxx.jpg', size }；el-upload 请用 :http-request 自定义调用 */
export const uploadImage = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  // 必须显式声明 multipart，否则 axios 会按默认的 application/json 把 FormData 序列化成 { }
  return request<{ url: string; size: number }>("post", "/api/v1/admin/upload", form, {
    "Content-Type": "multipart/form-data"
  });
};

// ─── 工具 ───

function toQuery(params?: Record<string, any>) {
  if (!params) return "";
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return q.length ? `?${q.join("&")}` : "";
}

/** 图片完整地址：开发环境经 vite 代理（vite.config.ts proxy /uploads），生产同域部署 */
export const fileUrl = (path: string) => path;
