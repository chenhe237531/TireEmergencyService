import { http } from "@/utils/http";
import { storageLocal } from "@pureadmin/utils";

export type UserResult = {
  success: boolean;
  message?: string;
  data: {
    avatar: string;
    username: string;
    nickname: string;
    roles: Array<string>;
    permissions: Array<string>;
    accessToken: string;
    refreshToken: string;
    expires: Date;
  };
};

export type RefreshTokenResult = {
  success: boolean;
  data: { accessToken: string; refreshToken: string; expires: Date };
};

/** 本地缓存的登录用户信息 key */
export const TIRE_USER_KEY = "tire-admin-user";

/** 后台登录：员工账号密码，后端校验后签发 admin 令牌（12h） */
export const getLogin = async (data?: any): Promise<UserResult> => {
  const res: any = await http.request("post", "/api/v1/admin/auth/login", {
    data
  });
  if (res.code !== 0) return { success: false, message: res.message, data: null as any };
  const d = res.data;
  storageLocal().setItem(TIRE_USER_KEY, d.user);
  return {
    success: true,
    data: {
      avatar: "",
      username: d.user.username,
      nickname: `${d.user.name} · ${d.user.roleName}`,
      roles: [d.user.role],
      permissions: [],
      accessToken: d.accessToken,
      refreshToken: d.accessToken,
      expires: new Date(Date.now() + 11 * 3600 * 1000)
    }
  };
};

/** 令牌 12 小时有效，到期后重新登录 */
export const refreshTokenApi = async (data?: any): Promise<RefreshTokenResult> => {
  return {
    success: true,
    data: {
      accessToken: data?.refreshToken,
      refreshToken: data?.refreshToken,
      expires: new Date(Date.now() + 3600 * 1000)
    }
  };
};

export const currentUser = () =>
  storageLocal().getItem<any>(TIRE_USER_KEY) || {};
