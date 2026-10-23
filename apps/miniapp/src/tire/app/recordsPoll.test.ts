import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordsSnapshot, RecordStatusChange } from './records'
import {
  holdRecordsPolling,
  markRecordLocalStatus,
  pollRecordsOnce,
  RECORDS_POLL_INTERVAL_MS,
  recordsPollStateForTest,
  resetRecordsPollingForTest,
  setRecordsAppVisible,
  setRecordsBackgroundPolling,
  setRecordsPollDeps,
} from './recordsPoll'

function snapshot(rescueStatus?: string, consultStatus?: string): RecordsSnapshot {
  return {
    rescues: rescueStatus == null
      ? []
      : [{
          id: 1,
          vehicleType: 'small_car',
          vehicleTypeName: '小车',
          plateNo: '苏A11111',
          lat: null,
          lng: null,
          locationDesc: '国道边上',
          status: rescueStatus,
          statusName: rescueStatus,
          assignedStore: null,
          createdAt: '2026-10-01 10:00:00',
          updatedAt: '2026-10-01 10:00:00',
        }],
    consults: consultStatus == null
      ? []
      : [{
          id: 2,
          plateNo: '',
          carModel: '',
          lat: null,
          lng: null,
          locationDesc: '',
          description: '轮胎没气',
          images: [],
          status: consultStatus,
          statusName: consultStatus,
          createdAt: '2026-10-01 10:00:00',
          updatedAt: '2026-10-01 10:00:00',
        }],
  }
}

interface Harness {
  fetch: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  schedule: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  tick: () => void
  setToken: (t: string) => void
}

/** 注入替身：fetch 返回脚本化快照序列，notify/emit 记录调用，schedule 可手动触发 */
function install(snapshots: RecordsSnapshot[], token = 'tk'): Harness {
  let tokenValue = token
  const fetch = vi.fn(async () => {
    const s = snapshots.shift()
    if (!s)
      throw new Error('no more snapshots')
    return s
  })
  const notify = vi.fn()
  const emit = vi.fn()
  let scheduled: (() => void) | null = null
  const schedule = vi.fn((fn: () => void, ms: number) => {
    expect(ms).toBe(RECORDS_POLL_INTERVAL_MS)
    scheduled = fn
    return 1
  })
  const cancel = vi.fn(() => {
    scheduled = null
  })
  setRecordsPollDeps({
    fetch,
    notify,
    emit,
    schedule,
    cancel,
    getToken: () => tokenValue,
  })
  return {
    fetch,
    notify,
    emit,
    schedule,
    cancel,
    tick: () => scheduled?.(),
    setToken: (t: string) => {
      tokenValue = t
    },
  }
}

beforeEach(() => {
  resetRecordsPollingForTest()
})

describe('pollRecordsOnce 基线与变化检测', () => {
  it('未登录：清空基线且不发起请求', async () => {
    install([snapshot('pending')], '')
    const res = await pollRecordsOnce()
    expect(res).toBeNull()
  })

  it('登录后首轮只建立基线，不通知', async () => {
    const h = install([snapshot('pending')])
    const res = await pollRecordsOnce()
    expect(res?.rescues).toHaveLength(1)
    expect(h.notify).not.toHaveBeenCalled()
    expect(h.emit).toHaveBeenCalledTimes(1)
  })

  it('第二轮检测到状态变化：通知并广播快照', async () => {
    const h = install([snapshot('pending'), snapshot('contacting')])
    await pollRecordsOnce()
    await pollRecordsOnce()
    const changes = h.notify.mock.calls[0][0] as RecordStatusChange[]
    expect(changes).toEqual([{ kind: 'rescue', id: 1, from: 'pending', to: 'contacting', statusName: 'contacting' }])
    expect(h.emit).toHaveBeenCalledTimes(2)
  })

  it('拉取失败保留基线：恢复后不会把整份基线丢失当成变化', async () => {
    const h = install([snapshot('pending')])
    await pollRecordsOnce()
    // 第二轮网络失败
    h.fetch.mockRejectedValueOnce(new Error('network'))
    await pollRecordsOnce()
    expect(h.notify).not.toHaveBeenCalled()
    // 第三轮恢复正常且状态未变：不应误报
    await pollRecordsOnce()
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('换账号登录后重新建立基线，不跨身份对比', async () => {
    const h = install([snapshot('pending'), snapshot('resolved')], 'tk-a')
    await pollRecordsOnce()
    // 换令牌（重新登录 / 合并换发）：下一轮不产生通知
    h.setToken('tk-b')
    await pollRecordsOnce()
    expect(h.notify).not.toHaveBeenCalled()
  })
})

describe('markRecordLocalStatus 本地操作同步基线', () => {
  it('司机自己取消工单后，下一轮不产生「已取消」自我通知', async () => {
    const h = install([snapshot('pending'), snapshot('cancelled')])
    await pollRecordsOnce()
    markRecordLocalStatus('rescue', 1, 'cancelled')
    await pollRecordsOnce()
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('基线尚未建立（未登录 / 首拉失败）时安全跳过', () => {
    expect(() => markRecordLocalStatus('rescue', 1, 'cancelled')).not.toThrow()
  })
})

describe('holdRecordsPolling 页面持有生命周期', () => {
  it('进入页面立即拉取一次并启动 30 秒定时器；释放后停止', async () => {
    const h = install([snapshot('pending')])
    const release = holdRecordsPolling()
    // 立即拉取（首拉建基线）
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    expect(h.schedule).toHaveBeenCalledTimes(1)
    expect(recordsPollStateForTest().hasTimer).toBe(true)

    release()
    expect(h.cancel).toHaveBeenCalledTimes(1)
    expect(recordsPollStateForTest().hasTimer).toBe(false)
  })

  it('重复释放只释放一次（onHide 与 onUnload 双保险）', async () => {
    const h = install([snapshot('pending')])
    const release = holdRecordsPolling()
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalled())
    release()
    release()
    expect(h.cancel).toHaveBeenCalledTimes(1)
    expect(recordsPollStateForTest().holdCount).toBe(0)
  })

  it('定时器周期触发轮询并通知变化（页面可见期间每 30 秒）', async () => {
    const h = install([snapshot('pending'), snapshot('resolved'), snapshot('resolved')])
    const release = holdRecordsPolling()
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    // 第二个快照在定时器触发时消费：pending → resolved 产生通知
    h.tick()
    await vi.waitFor(() => expect(h.notify).toHaveBeenCalledTimes(1))
    // 第三轮无变化：不再通知
    h.tick()
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(3))
    expect(h.notify).toHaveBeenCalledTimes(1)
    release()
  })
})

describe('setRecordsBackgroundPolling 后台轮询（仅 App 端语义）', () => {
  it('app 后台（进程存活）：立即拉取一次并保持定时器，回前台停止', async () => {
    const h = install([snapshot('pending')])
    setRecordsBackgroundPolling(true)
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    expect(recordsPollStateForTest().hasTimer).toBe(true)

    setRecordsBackgroundPolling(false)
    expect(recordsPollStateForTest().hasTimer).toBe(false)
  })

  it('后台期间状态变化会走到通知链路（由 notify 决定 toast 或本地通知）', async () => {
    const h = install([snapshot('pending'), snapshot('contacting')])
    setRecordsBackgroundPolling(true)
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    h.tick()
    await vi.waitFor(() => expect(h.notify).toHaveBeenCalledTimes(1))
    setRecordsBackgroundPolling(false)
  })

  it('重复设置同一状态不重复拉取 / 重建定时器', async () => {
    const h = install([snapshot('pending')])
    setRecordsBackgroundPolling(true)
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    setRecordsBackgroundPolling(true)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.schedule).toHaveBeenCalledTimes(1)
    setRecordsBackgroundPolling(false)
  })
})

describe('setRecordsAppVisible 前台可见性门控（H5 标签页隐藏停止轮询）', () => {
  it('app 不可见时页面持有也暂停定时器，恢复可见后重启', async () => {
    const h = install([snapshot('pending')])
    const release = holdRecordsPolling()
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))
    expect(recordsPollStateForTest().hasTimer).toBe(true)

    // H5 标签页隐藏 / 小程序切走：App 整体不可见，页面未释放也暂停
    // （H5 / 小程序构建时后台轮询被条件编译裁掉，只有这里的前台门控生效）
    setRecordsAppVisible(false)
    expect(recordsPollStateForTest().hasTimer).toBe(false)

    // 回到可见：页面仍在栈内（未释放），轮询恢复
    setRecordsAppVisible(true)
    expect(recordsPollStateForTest().hasTimer).toBe(true)
    release()
    expect(recordsPollStateForTest().hasTimer).toBe(false)
  })

  it('app 端退后台：可见性关闭后由后台轮询接管，定时器保持运行', async () => {
    const h = install([snapshot('pending')])
    const release = holdRecordsPolling()
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1))

    // App.vue onHide 的完整序列：先不可见，再开后台轮询（测试环境为 App 语义）
    setRecordsAppVisible(false)
    expect(recordsPollStateForTest().hasTimer).toBe(false)
    setRecordsBackgroundPolling(true)
    expect(recordsPollStateForTest().hasTimer).toBe(true)

    // 回前台：关后台轮询、恢复可见
    setRecordsBackgroundPolling(false)
    setRecordsAppVisible(true)
    expect(recordsPollStateForTest().hasTimer).toBe(true)
    release()
  })
})
