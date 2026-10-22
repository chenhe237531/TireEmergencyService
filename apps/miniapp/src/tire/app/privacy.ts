/**
 * 隐私政策同意状态（仅 APP-PLUS 使用）。
 *
 * 首次启动必须同意后才能初始化高德地图等第三方 SDK；
 * 版本号写进 key，政策更新时可让老用户重新确认。
 */
export const PRIVACY_CONSENT_KEY = 'tire_privacy_consent_v1'

export function hasPrivacyConsent(): boolean {
  try {
    return uni.getStorageSync(PRIVACY_CONSENT_KEY) === '1'
  }
  catch {
    return false
  }
}

export function acceptPrivacy() {
  try {
    uni.setStorageSync(PRIVACY_CONSENT_KEY, '1')
  }
  catch {
    // 本地存储不可用时保持未同意，下次启动会再次提示
  }
}

/** 第三方 SDK（高德定位 / 地图）初始化前的统一闸门 */
export function canInitThirdPartySdk(): boolean {
  return hasPrivacyConsent()
}
