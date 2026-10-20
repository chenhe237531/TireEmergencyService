/** 通用工具：页面跳转、提示、确认、拨号、相对路径转绝对地址 */

const TAB_PAGES = ['/pages/index/index', '/pages/consult/index', '/pages/me/index']

export function go(url?: string | null) {
  if (!url) return
  const path = url.split('?')[0]
  if (TAB_PAGES.includes(path)) uni.switchTab({ url: path })
  else uni.navigateTo({ url, fail: () => uni.redirectTo({ url }) })
}

export function back(fallback = '/pages/index/index') {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else go(fallback)
}

export function toast(title: string) {
  uni.showToast({ title, icon: 'none', duration: 2200 })
}

export function confirm(title: string, content: string, confirmText = '确认'): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({ title, content, confirmText, cancelText: '再想想', success: r => resolve(!!r.confirm), fail: () => resolve(false) })
  })
}

/** 拨打电话（H5 与小程序通用） */
export function call(phone: string) {
  if (!phone) return
  // #ifdef H5
  window.location.href = `tel:${phone}`
  // #endif
  // #ifndef H5
  uni.makePhoneCall({ phoneNumber: phone })
  // #endif
}

/**
 * 服务端相对路径（如 /uploads/xx）转完整 URL：
 * mp-weixin 会把 "/" 开头的 image src 按包内路径解析导致加载失败，需拼服务端 origin；
 * H5 与服务端同源，相对路径直接可用。
 */
export function absUrl(u?: string | null) {
  if (!u || !u.startsWith('/')) return u || ''
  // #ifdef MP-WEIXIN
  const base = (import.meta.env.VITE_MP_SERVER_BASEURL || import.meta.env.VITE_SERVER_BASEURL || '') as string
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0]
  if (origin) return origin + u
  // #endif
  return u
}

/**
 * 设备标识：演示登录模式下作为 code 换取稳定 openid（同一设备 = 同一司机身份）。
 * 不随退出登录清除；配置 WX_APPID/WX_SECRET 后切换为真实微信登录，不再使用。
 */
export function deviceId() {
  let id = uni.getStorageSync('tire_device')
  if (!id) {
    id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    uni.setStorageSync('tire_device', id)
  }
  return id as string
}
