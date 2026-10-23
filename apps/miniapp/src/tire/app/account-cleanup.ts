/**
 * 账号注销后的本地数据清理（issue #10 / ADR-0006）。
 *
 * 清掉账号级状态：登录令牌、表单草稿、提交幂等键等待办键（按 tire_ 前缀统一清理，
 * 后续新增的草稿键无需改这里）。保留设备级状态：隐私同意、更新检查节流、设备标识
 * ——它们与账号无关，注销后重新注册不需要重新确认隐私政策。
 */
import { PRIVACY_CONSENT_KEY } from './privacy'

/** 设备级键：注销后必须保留（隐私同意 / 更新节流 / 演示设备标识） */
const DEVICE_LEVEL_KEYS = new Set([PRIVACY_CONSENT_KEY, 'tire_update_last_check_at', 'tire_device'])

/** 清理当前账号在本机留下的所有数据；未登录调用也无副作用 */
export function cleanupAccountStorage() {
  let keys: string[] = []
  try {
    keys = uni.getStorageInfoSync().keys || []
  }
  catch {
    // 存储不可用时无从清理，登录态由 tire.logout() 兜底
    return
  }
  for (const key of keys) {
    if (key.startsWith('tire_') && !DEVICE_LEVEL_KEYS.has(key)) {
      try {
        uni.removeStorageSync(key)
      }
      catch {
        // 单个键清理失败不阻断其余键
      }
    }
  }
}
