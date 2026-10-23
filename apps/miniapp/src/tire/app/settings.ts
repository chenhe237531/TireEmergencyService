/**
 * 平台设置解析（/app/settings）。
 *
 * 纯逻辑模块：字段兜底、备案号占位、分享文案组装都放这里，
 * 页面只做展示与跳转；后台未配置的可选字段（备案号 / 协议外链 / H5 链接）
 * 统一降级为空串，端上按占位或降级处理，保证向后兼容。
 */

/** 平台设置（normalize 后的结构，字段均有兜底值） */
export interface PlatformSettings {
  servicePhone: string
  wechatQr: string
  about: string
  userAgreement: string
  privacyPolicy: string
  shareTitle: string
  /** App 备案号：关于页展示，未配置为空串 */
  icpNumber: string
  /** 用户协议外链：配置后「关于」页直接打开，未配置沿用内置文本 */
  userAgreementUrl: string
  /** 隐私政策外链：同上 */
  privacyPolicyUrl: string
  /** H5 站点地址：安卓系统分享面板分享的落地链接 */
  h5Url: string
}

/** 兜底文案：后台「分享标题」未配置时用（与 tire/share.ts 的默认文案一致） */
export const FALLBACK_SHARE_TITLE = '小蚂蚁轮胎救援 · 24 小时轮胎救援一键呼叫'

/** 备案号未配置时的占位文案（发布前由运营在后台填入真实备案号） */
export const ICP_PLACEHOLDER = '发布前填入'

/** 任意原始 settings（字段缺失 / null 均安全）统一为完整结构 */
export function normalizeSettings(raw: any): PlatformSettings {
  const r = raw || {}
  return {
    servicePhone: String(r.servicePhone || '').trim(),
    wechatQr: String(r.wechatQr || '').trim(),
    about: String(r.about || ''),
    userAgreement: String(r.userAgreement || ''),
    privacyPolicy: String(r.privacyPolicy || ''),
    shareTitle: String(r.shareTitle || '').trim() || FALLBACK_SHARE_TITLE,
    icpNumber: String(r.icpNumber || '').trim(),
    userAgreementUrl: String(r.userAgreementUrl || '').trim(),
    privacyPolicyUrl: String(r.privacyPolicyUrl || '').trim(),
    h5Url: String(r.h5Url || '').trim(),
  }
}

/** 关于页备案号文案：未配置时展示占位，提示发布前填入 */
export function icpNumberText(icp: string): string {
  const v = String(icp || '').trim()
  return v ? `App 备案号：${v}` : `App 备案号：${ICP_PLACEHOLDER}`
}

/** 系统分享 / 复制到剪贴板的完整文案（标题 + 说明 + 链接） */
export function buildShareMessage(title: string, href: string): string {
  const t = String(title || '').trim() || FALLBACK_SHARE_TITLE
  const parts = [t, '24 小时轮胎救援 · 平台调度 · 就近安排门店上门服务']
  const url = String(href || '').trim()
  if (url)
    parts.push(url)
  return parts.join('｜')
}

/** 海报与系统分享共用的内容组装：标题 / 落地链接 / 客服电话 */
export interface PosterContent {
  /** 邀请文案（海报主标题 / 分享标题） */
  title: string
  /** 系统分享的 H5 落地链接，未配置为空串 */
  href: string
  /** 复制兜底用的完整文案 */
  message: string
  /** 客服电话（海报电话块用），未配置为空串 */
  phone: string
}

export function buildPosterContent(s: PlatformSettings): PosterContent {
  return {
    title: s.shareTitle,
    href: s.h5Url,
    message: buildShareMessage(s.shareTitle, s.h5Url),
    phone: s.servicePhone,
  }
}
