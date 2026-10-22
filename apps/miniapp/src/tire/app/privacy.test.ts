import { describe, expect, it, vi } from 'vitest'
import { acceptPrivacy, canInitThirdPartySdk, hasPrivacyConsent, PRIVACY_CONSENT_KEY } from './privacy'

describe('privacy consent', () => {
  it('未同意时不允许初始化第三方 SDK', () => {
    vi.mocked(uni.getStorageSync).mockReturnValue('')
    expect(hasPrivacyConsent()).toBe(false)
    expect(canInitThirdPartySdk()).toBe(false)
  })

  it('同意后写入标记并放行第三方 SDK', () => {
    acceptPrivacy()
    expect(uni.setStorageSync).toHaveBeenCalledWith(PRIVACY_CONSENT_KEY, '1')
    vi.mocked(uni.getStorageSync).mockReturnValue('1')
    expect(hasPrivacyConsent()).toBe(true)
    expect(canInitThirdPartySdk()).toBe(true)
  })
})
