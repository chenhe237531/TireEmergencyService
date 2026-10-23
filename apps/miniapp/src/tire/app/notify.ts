/**
 * 状态变化通知（issue #8 / 设计文档 7.5、7.7）。
 *
 * - 前台：uni.showToast 提示；
 * - App 在后台但进程存活（仅 APP-PLUS）：plus.push.createMessage 发本地通知，
 *   点击通知回到「我的记录」；小程序 / H5 后台不做本地通知（设计文档 7.1）；
 * - Android 13+ 首次需要 POST_NOTIFICATIONS 运行时权限：请求一次即记录，
 *   拒绝后不再循环弹窗（业务上由客服电话联系，不依赖通知）。
 *
 * vitest 不裁剪条件编译：plus 相关调用全部先探测 typeof 再使用，测试环境天然落到
 * 非 App 分支（参考 update.ts / location.ts 同款写法）。
 */
import { canInitThirdPartySdk } from '@/tire/app/privacy'
import { RECORD_KIND_NAMES } from '@/tire/app/records'
import type { RecordStatusChange } from '@/tire/app/records'
import { go, toast } from '@/tire/utils'

/** 本地通知是否需要请求系统运行时权限的 Android 版本（API 33 = Android 13） */
export const NOTIFY_PERMISSION_ANDROID_VERSION = 13
/** 通知权限「已请求过」标记：拒绝后不再重复打扰 */
export const NOTIFY_PERMISSION_ASKED_KEY = 'tire_notify_permission_asked_v1'

/** App 前台状态：由 App.vue 的 onShow / onHide 维护，默认前台（启动） */
let appForeground = true

export function setAppForeground(v: boolean) {
  appForeground = v
}

export function isAppForeground(): boolean {
  return appForeground
}

/**
 * 当前平台是否支持后台本地通知：仅 App 端。
 * mp-weixin / h5 构建时分支被裁掉恒为 false（H5 仅前台轮询，小程序后台进程挂起）。
 */
export function supportsLocalNotify(): boolean {
  // #ifdef APP-PLUS
  return true
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

/** 通知文案：您的救援工单 #12 已更新：跟进中 */
export function formatStatusChange(change: RecordStatusChange): string {
  return `您的${RECORD_KIND_NAMES[change.kind]} #${change.id} 已更新：${change.statusName}`
}

/**
 * 展示状态变化：前台逐条 toast（多条时后者覆盖前者，可接受）；
 * 后台仅 App 端发本地通知，其余平台静默。
 */
export function notifyStatusChanges(changes: RecordStatusChange[]) {
  if (!changes?.length)
    return
  if (isAppForeground()) {
    for (const c of changes)
      toast(formatStatusChange(c))
    return
  }
  if (!supportsLocalNotify())
    return
  for (const c of changes)
    createLocalNotification(formatStatusChange(c), { records: true, kind: c.kind, id: c.id })
}

/**
 * 发本地通知（仅 APP-PLUS）：plus.push 需在 manifest 勾选 Push 模块，
 * 探测不到时静默跳过（不影响业务）。
 */
export function createLocalNotification(content: string, payload: Record<string, unknown> = {}) {
  // #ifdef APP-PLUS
  const push = typeof plus !== 'undefined' ? (plus as any).push : null
  if (!push || typeof push.createMessage !== 'function')
    return
  registerClickRouting(push)
  try {
    push.createMessage(content, payload, { title: '小蚂蚁轮胎救援', cover: false, sound: 'system' })
  }
  catch {
    // 通知创建失败不影响业务：司机仍可进「我的记录」查看进度
  }
  // #endif
}

/** 本地通知点击路由：只注册一次，回到「我的记录」 */
let clickRouted = false

function registerClickRouting(push: any) {
  if (clickRouted)
    return
  clickRouted = true
  try {
    push.addEventListener('click', (msg: any) => {
      if (msg?.payload?.records === true)
        // 等待 App 从通知点击中完成恢复再跳页面
        setTimeout(() => go('/pkg-me/records'), 350)
    })
  }
  catch {
    clickRouted = true
  }
}

/** 纯函数：是否需要请求通知运行时权限（Android 13+ 且从未请求过） */
export function shouldRequestNotifyPermission(androidVersion: number, alreadyAsked: boolean): boolean {
  return !alreadyAsked && androidVersion >= NOTIFY_PERMISSION_ANDROID_VERSION
}

/**
 * 首页进入时调用：Android 13+ 且同意隐私政策后请求一次 POST_NOTIFICATIONS。
 * 标记先落盘再请求，拒绝后不再弹（7.7：拒绝后不循环弹窗）；
 * 其余平台 / 低版本（安装时已授予）直接跳过。
 */
export function ensureNotifyPermission() {
  // #ifdef APP-PLUS
  const runtime = typeof plus !== 'undefined' ? plus : null
  if (!runtime)
    return
  const os = (runtime as any).os
  if (!os || os.name !== 'Android')
    return
  if (!canInitThirdPartySdk())
    return
  const version = Number.parseInt(String(os?.version ?? ''), 10)
  let asked = false
  try {
    asked = uni.getStorageSync(NOTIFY_PERMISSION_ASKED_KEY) === '1'
  }
  catch {
    asked = false
  }
  if (!shouldRequestNotifyPermission(Number.isFinite(version) ? version : 0, asked))
    return
  try {
    uni.setStorageSync(NOTIFY_PERMISSION_ASKED_KEY, '1')
  }
  catch {
    // 存储异常时宁可多问一次，也不永远失去通知能力
  }
  try {
    (plus as any).android.requestPermissions(
      ['android.permission.POST_NOTIFICATIONS'],
      () => {},
      () => {},
    )
  }
  catch {
    // 权限接口异常不影响业务
  }
  // #endif
}
