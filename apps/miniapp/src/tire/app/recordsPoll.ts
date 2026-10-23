/**
 * 记录轮询（issue #8 / 设计文档 7.5）。
 *
 * 生命周期由两类持有方驱动：
 * - 页面持有（首页 / 我的记录）：onShow 时 holdRecordsPolling() 立即拉取一次并
 *   每 30 秒轮询，onHide 时释放；「页面可见期间轮询、页面隐藏后停止」。
 * - 后台持有（仅 APP-PLUS）：App 退到后台但进程存活时由 App.vue 调
 *   setRecordsBackgroundPolling(true) 继续轮询，状态变化用本地通知提醒；
 *   回前台交还给页面持有方。小程序 / H5 后台进程挂起，该开关为 no-op。
 *
 * 未登录不轮询；拉取失败保留基线（网络恢复后不会把基线丢失当成「全部变化」）；
 * 司机本地操作（如取消）通过 markRecordLocalStatus 同步基线，避免自我通知。
 */
import { diffRecordStatus, fetchMyRecords } from '@/tire/app/records'
import type { RecordKind, RecordsSnapshot, RecordStatusChange } from '@/tire/app/records'
import { notifyStatusChanges, supportsLocalNotify } from '@/tire/app/notify'
import { getToken } from '@/tire/request'

/** 轮询间隔：页面可见期间每 30 秒一次 */
export const RECORDS_POLL_INTERVAL_MS = 30 * 1000
/** 快照事件：每轮拉取成功后广播，记录页据此静默刷新列表 */
export const RECORDS_REFRESH_EVENT = 'tire:records-refreshed'

/** 可注入依赖：测试里替换网络、通知与定时器，页面用默认实现 */
interface PollDeps {
  fetch: () => Promise<RecordsSnapshot>
  notify: (changes: RecordStatusChange[]) => void
  getToken: () => string
  emit: (snapshot: RecordsSnapshot) => void
  schedule: (fn: () => void, ms: number) => number
  cancel: (timer: number) => void
}

const defaultDeps: PollDeps = {
  fetch: fetchMyRecords,
  notify: notifyStatusChanges,
  getToken,
  emit: snapshot => uni.$emit(RECORDS_REFRESH_EVENT, snapshot),
  schedule: (fn, ms) => setInterval(fn, ms) as unknown as number,
  cancel: (timer) => {
    clearInterval(timer)
  },
}

let deps: PollDeps = { ...defaultDeps }

/** 仅测试使用：注入替身依赖（不传的字段保持原样） */
export function setRecordsPollDeps(overrides: Partial<PollDeps>) {
  deps = { ...deps, ...overrides }
}

/** 仅测试使用：还原默认依赖并清空全部轮询状态 */
export function resetRecordsPollingForTest() {
  deps = { ...defaultDeps }
  resetPollingState()
}

let baseline: RecordsSnapshot | null = null
let baselineToken = ''
let timer: number | null = null
let holdCount = 0
let backgroundHeld = false
/** App 是否可见（前台）：App.vue onShow/onHide 维护；H5 标签页隐藏等场景整体停轮询 */
let appVisible = true
let polling = false

function resetPollingState() {
  if (timer != null)
    deps.cancel(timer)
  baseline = null
  baselineToken = ''
  timer = null
  holdCount = 0
  backgroundHeld = false
  appVisible = true
  polling = false
}

function updateTimer() {
  // 前台轮询：页面持有且 App 可见；后台轮询：仅 App 端退后台（进程存活）继续
  const active = (holdCount > 0 && appVisible) || backgroundHeld
  if (active && timer == null) {
    timer = deps.schedule(() => void pollRecordsOnce(), RECORDS_POLL_INTERVAL_MS)
  }
  else if (!active && timer != null) {
    deps.cancel(timer)
    timer = null
  }
}

/** App 可见性由 App.vue 维护：H5 标签页隐藏 / 小程序切走时整体停止前台轮询 */
export function setRecordsAppVisible(visible: boolean) {
  appVisible = visible
  updateTimer()
}

/**
 * 页面进入可见时调用（onShow），返回释放函数（onHide / onUnload 时调用）：
 * 立即拉取一次建立/更新基线，之后由共享定时器每 30 秒轮询。
 * 重复调用叠加引用计数，两个页面切换时不会出现轮询空档。
 */
export function holdRecordsPolling(): () => void {
  holdCount++
  updateTimer()
  // 进入页面立即拉取：首拉只建立基线，不等第一个 30 秒
  void pollRecordsOnce()
  let released = false
  return () => {
    if (released)
      return
    released = true
    holdCount = Math.max(0, holdCount - 1)
    updateTimer()
  }
}

/**
 * App 前后台切换时由 App.vue 调用：
 * 后台（进程存活）开启轮询驱动本地通知；回前台关闭，由页面持有方接管。
 */
export function setRecordsBackgroundPolling(active: boolean) {
  if (!supportsLocalNotify()) {
    backgroundHeld = false
    updateTimer()
    return
  }
  if (backgroundHeld === active)
    return
  backgroundHeld = active
  updateTimer()
  if (active)
    void pollRecordsOnce()
}

/**
 * 拉取一次记录并与基线对比：未登录返回 null；登录后首轮只建立基线；
 * 后续轮询检测到状态变化交给 notify（前台 toast / 后台本地通知），
 * 并广播快照给记录页刷新列表。
 */
export async function pollRecordsOnce(): Promise<RecordsSnapshot | null> {
  if (polling)
    return null
  const token = deps.getToken()
  if (!token) {
    // 未登录：清空基线，登录后重新建立，避免跨身份对比
    baseline = null
    baselineToken = ''
    return null
  }
  polling = true
  try {
    const snapshot = await deps.fetch()
    // 拉取期间登录态被切换（重新登录 / 合并换发令牌）：丢弃本轮，等下一轮
    if (deps.getToken() !== token)
      return null
    if (baselineToken !== token) {
      baseline = null
      baselineToken = token
    }
    const changes = diffRecordStatus(baseline, snapshot)
    baseline = snapshot
    if (changes.length)
      deps.notify(changes)
    deps.emit(snapshot)
    return snapshot
  }
  catch {
    // 拉取失败保留基线：短暂网络问题恢复后不会把基线丢失当成「全部变化」
    return null
  }
  finally {
    polling = false
  }
}

/** 司机本地操作（取消等）后同步基线状态，避免下一轮把自己的操作当成状态变化通知 */
export function markRecordLocalStatus(kind: RecordKind, id: number, status: string, statusName?: string) {
  if (!baseline)
    return
  const list = kind === 'rescue' ? baseline.rescues : baseline.consults
  const row = list.find(r => r.id === id)
  if (!row)
    return
  row.status = status
  if (statusName)
    row.statusName = statusName
}

/** 仅测试使用：观察内部状态 */
export function recordsPollStateForTest() {
  return { holdCount, backgroundHeld, hasTimer: timer != null, hasBaseline: baseline != null }
}
