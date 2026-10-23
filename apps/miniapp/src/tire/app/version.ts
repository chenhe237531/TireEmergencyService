/**
 * 应用版本号读取（关于页展示）。
 *
 * 三端来源不同：App 取 plus.runtime.version（云打包为 manifest 的 versionName），
 * 小程序取 uni.getAccountInfoSync().miniProgram.version（开发/体验版可能为空），
 * 其余回退 manifest 里维护的 versionName。注意：vitest 不做条件编译，
 * plus / getAccountInfoSync 都可能不存在，必须先做存在性判断。
 */
export const FALLBACK_APP_VERSION = '1.0.0'

export function getAppVersion(fallback = FALLBACK_APP_VERSION): string {
  // #ifdef APP-PLUS
  try {
    const v = (plus as any)?.runtime?.version
    if (v)
      return v
  }
  catch {
    // 取不到按兜底版本展示
  }
  // #endif
  // #ifdef MP-WEIXIN
  try {
    const v = uni.getAccountInfoSync?.()?.miniProgram?.version
    if (v)
      return v
  }
  catch {
    // 开发者工具里可能拿不到版本号，按兜底展示
  }
  // #endif
  return fallback
}
