import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupAccountStorage } from './account-cleanup'

describe('账号注销本地清理', () => {
  const removed: string[] = []

  beforeEach(() => {
    removed.length = 0
    vi.mocked(uni.getStorageInfoSync).mockReturnValue({
      keys: [
        'tire_token',
        'tire_draft_rescue',
        'tire_submit_request_id_rescue',
        'tire_draft_consult',
        'tire_privacy_consent_v1',
        'tire_update_last_check_at',
        'tire_device',
        'app-tabbar-path',
      ],
    } as unknown as UniNamespace.GetStorageInfoSuccess)
    vi.mocked(uni.removeStorageSync).mockImplementation((key: string) => {
      removed.push(key)
    })
  })

  it('清除账号级键：令牌 / 草稿 / 幂等键（含后续新增的咨询草稿）', () => {
    cleanupAccountStorage()

    expect(removed).toContain('tire_token')
    expect(removed).toContain('tire_draft_rescue')
    expect(removed).toContain('tire_submit_request_id_rescue')
    expect(removed).toContain('tire_draft_consult')
  })

  it('保留设备级键：隐私同意 / 更新节流 / 设备标识', () => {
    cleanupAccountStorage()

    expect(removed).not.toContain('tire_privacy_consent_v1')
    expect(removed).not.toContain('tire_update_last_check_at')
    expect(removed).not.toContain('tire_device')
  })

  it('不动非 tire_ 前缀的键（如 tabbar 路径）', () => {
    cleanupAccountStorage()

    expect(removed).not.toContain('app-tabbar-path')
  })

  it('存储不可用时静默返回，不抛错', () => {
    vi.mocked(uni.getStorageInfoSync).mockImplementation(() => {
      throw new Error('storage broken')
    })

    expect(() => cleanupAccountStorage()).not.toThrow()
    expect(removed).toHaveLength(0)
  })
})
