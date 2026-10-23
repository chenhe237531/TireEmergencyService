import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordStatusChange } from './records'
import {
  createLocalNotification,
  ensureNotifyPermission,
  formatStatusChange,
  isAppForeground,
  NOTIFY_PERMISSION_ANDROID_VERSION,
  notifyStatusChanges,
  setAppForeground,
  shouldRequestNotifyPermission,
} from './notify'

function change(kind: 'rescue' | 'consult', id: number, to: string): RecordStatusChange {
  return { kind, id, from: 'pending', to, statusName: to }
}

beforeEach(() => {
  // 前台状态是模块级单例：每个用例前复位为默认「前台」
  setAppForeground(true)
  vi.mocked(uni.showToast).mockClear()
})

describe('状态变化通知 notifyStatusChanges', () => {
  it('前台：逐条 toast，文案包含记录类型与状态', () => {
    notifyStatusChanges([change('rescue', 12, '跟进中')])

    expect(uni.showToast).toHaveBeenCalled()
    const arg = vi.mocked(uni.showToast).mock.calls[0][0] as any
    expect(arg.title).toBe('您的救援工单 #12 已更新：跟进中')
  })

  it('前台：空变化列表不提示', () => {
    notifyStatusChanges([])
    expect(uni.showToast).not.toHaveBeenCalled()
  })

  it('后台且无 plus 运行时：静默跳过，不抛错不 toast', () => {
    setAppForeground(false)
    // vitest 环境无 plus 全局：APP-PLUS 分支探测失败应静默
    expect(() => notifyStatusChanges([change('consult', 8, '已解决')])).not.toThrow()
    expect(uni.showToast).not.toHaveBeenCalled()
  })
})

describe('通知文案 formatStatusChange', () => {
  it('救援咨询使用「救援咨询」称呼', () => {
    expect(formatStatusChange(change('consult', 3, '已解决'))).toBe('您的救援咨询 #3 已更新：已解决')
  })
})

describe('本地通知 createLocalNotification', () => {
  it('无 plus 运行时静默跳过（小程序 / H5 / 测试环境语义一致）', () => {
    expect(() => createLocalNotification('内容', { records: true })).not.toThrow()
  })
})

describe('前台状态', () => {
  it('默认前台，setAppForeground 切换', () => {
    expect(isAppForeground()).toBe(true)
    setAppForeground(false)
    expect(isAppForeground()).toBe(false)
    setAppForeground(true)
    expect(isAppForeground()).toBe(true)
  })
})

describe('通知权限决策 shouldRequestNotifyPermission', () => {
  it('android 13+ 且未请求过才需要请求', () => {
    expect(shouldRequestNotifyPermission(13, false)).toBe(true)
    expect(shouldRequestNotifyPermission(14, false)).toBe(true)
  })

  it('低版本安装时已授予，不需要运行时请求', () => {
    expect(shouldRequestNotifyPermission(12, false)).toBe(false)
    expect(shouldRequestNotifyPermission(10, false)).toBe(false)
  })

  it('请求过一次后（含被拒绝）不再请求，避免循环弹窗', () => {
    expect(shouldRequestNotifyPermission(13, true)).toBe(false)
    expect(shouldRequestNotifyPermission(NOTIFY_PERMISSION_ANDROID_VERSION, true)).toBe(false)
  })
})

describe('通知权限请求 ensureNotifyPermission', () => {
  it('无 plus 运行时静默跳过，不读写存储', () => {
    expect(() => ensureNotifyPermission()).not.toThrow()
    expect(uni.setStorageSync).not.toHaveBeenCalledWith('tire_notify_permission_asked_v1', '1')
  })
})
