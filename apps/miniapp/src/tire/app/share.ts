/**
 * 分享能力封装（安卓 App 系统分享面板分享 H5 链接）。
 *
 * 文案组装的纯逻辑在 settings.ts（buildShareMessage / buildPosterContent），
 * 这里只做平台差异：APP-PLUS 用 uni.share 的系统面板分享 H5 链接，
 * 失败（未配置分享模块 / 用户取消 / 其他端调用）统一返回 false，
 * 由调用方降级为复制文案 —— 小程序保留微信分享链路（tire/share.ts），
 * H5 保留「复制邀请文案」。
 */

export interface SystemSharePayload {
  /** 分享标题（后台「分享标题」） */
  title: string
  /** H5 落地链接（后台 h5Url，未配置为空串） */
  href: string
  /** 纯文本兜底文案（含链接，任何分享目标都能识别） */
  message: string
}

/** 分享结果：'shared' 已拉起并分享成功；'canceled' 用户取消；'failed' 拉起失败 */
export type SystemShareResult = 'shared' | 'canceled' | 'failed'

/** uni.share 单次调用 */
function invokeShare(options: any): Promise<SystemShareResult> {
  return new Promise((resolve) => {
    uni.share({
      ...options,
      success: () => resolve('shared'),
      fail: (err: any) => resolve(/cancel/i.test(err?.errMsg || '') ? 'canceled' : 'failed'),
    } as any)
  })
}

/**
 * 安卓系统分享面板分享 H5 链接：
 * 优先按图文链接分享（type 0，带 href）；拉起失败再按纯文本分享（type 1，
 * 文案含链接）；两次都失败返回 'failed'，调用方降级为复制文案。
 */
export async function shareH5ToSystem(payload: SystemSharePayload): Promise<SystemShareResult> {
  // #ifndef APP-PLUS
  // 小程序 / H5 无系统分享面板：微信分享走 onShareAppMessage，H5 由调用方复制文案
  return 'failed'
  // #endif
  // #ifdef APP-PLUS
  if (payload.href) {
    const r = await invokeShare({
      provider: 'system',
      type: 0,
      title: payload.title,
      summary: payload.message,
      href: payload.href,
    })
    if (r !== 'failed')
      return r
  }
  return invokeShare({
    provider: 'system',
    type: 1,
    summary: payload.message,
  })
  // #endif
}
