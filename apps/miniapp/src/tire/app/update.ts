/**
 * App 端应用内更新检查（仅 APP-PLUS；小程序 / H5 完全不受影响）。
 *
 * 设计文档 7.6：启动时与每 24 小时拉取 /downloads/android.json，与本地
 * versionCode 比较；低于 minVersionCode 弹不可关闭的强制更新，其余新版本
 * 弹可关闭的更新提示；下载后 plus.runtime.install 拉起安装，安装失败
 * （含「安装未知应用」权限被拒）转浏览器下载并引导开启权限。
 * 清单 schema 与托管要求见 app 仓 docs/update-manifest.md。
 */
import { toast } from '@/tire/utils'

export interface UpdateManifest {
  /** 最新构建号（单调递增，对应 manifest.json 的 versionCode） */
  versionCode: number
  /** 最新版本名（语义化版本） */
  versionName: string
  /** APK 下载地址：与清单同域的根相对路径，或绝对 HTTPS 地址 */
  url: string
  /** 更新说明（可空，弹窗正文兜底文案） */
  notes?: string
  /** 最低支持构建号：本地 versionCode 低于此值且确有新版本时强制更新 */
  minVersionCode: number
}

export interface UpdateDecision {
  update: boolean
  forced: boolean
}

/** 本地 versionCode 读取失败时的哨兵值：直接放弃本次检查，避免误判强更 */
export const UNKNOWN_VERSION_CODE = -1

export const UPDATE_LAST_CHECK_KEY = 'tire_update_last_check_at'
/** 检查节流窗口：24 小时内最多拉取一次（拉取失败不计时，下次启动继续尝试） */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * 更新逻辑是否作用于当前平台：仅 App 端为 true。
 * 注意：vitest 不做条件编译，测试环境按 App 语义运行（恒为 true）；
 * mp-weixin / h5 构建时分支被裁掉，恒为 false（参考 location.ts 同款写法）。
 */
export function isUpdatePlatform(): boolean {
  // #ifdef APP-PLUS
  return true
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

/**
 * 纯函数：比较本地与清单版本。
 * forced 仅在确有新版本时成立——本地低于 minVersionCode 但清单不高于本地
 * （清单配置异常）时按无更新处理，不去打扰司机。
 */
export function compareVersion(localVersionCode: number, manifest: UpdateManifest): UpdateDecision {
  const update = localVersionCode >= 0 && manifest.versionCode > localVersionCode
  return { update, forced: update && localVersionCode < manifest.minVersionCode }
}

/**
 * 纯函数：距上次检查是否满 24 小时（从未检查 / 时间异常视为需要检查）。
 * 启动检查同样受节流：每次启动都尝试，但 24 小时内已成功拉取过就跳过，
 * 与设计文档「启动时与每 24 小时」取简单一致的口径。
 */
export function isCheckDue(lastCheckAt: number, now: number): boolean {
  if (!Number.isFinite(lastCheckAt) || lastCheckAt <= 0)
    return true
  return now - lastCheckAt >= UPDATE_CHECK_INTERVAL_MS
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value))
    return value
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * 纯函数：校验并规范化清单。清单是静态文件而非 { code, message, data }
 * 包裹的接口，字段缺失 / 类型不符 / url 非法一律返回 null（静默按无更新处理）。
 */
export function parseManifest(raw: unknown): UpdateManifest | null {
  if (!raw || typeof raw !== 'object')
    return null
  const m = raw as Record<string, unknown>
  const versionCode = toInt(m.versionCode)
  const minVersionCode = toInt(m.minVersionCode)
  const versionName = typeof m.versionName === 'string' ? m.versionName.trim() : ''
  const url = typeof m.url === 'string' ? m.url.trim() : ''
  if (!Number.isFinite(versionCode) || versionCode <= 0)
    return null
  if (!Number.isFinite(minVersionCode) || minVersionCode < 0)
    return null
  if (!versionName || !/^(?:https?:\/\/|\/)/i.test(url))
    return null
  return {
    versionCode,
    versionName,
    url,
    notes: typeof m.notes === 'string' && m.notes.trim() ? m.notes.trim() : undefined,
    minVersionCode,
  }
}

/**
 * 纯函数：APK 下载地址补全。清单与 APK 同域托管，url 支持根相对路径，
 * 按清单实际访问域名补全；绝对地址原样返回。
 */
export function resolveApkUrl(apkUrl: string, manifestUrl: string): string {
  if (/^https?:\/\//i.test(apkUrl))
    return apkUrl
  const origin = manifestUrl.match(/^https?:\/\/[^/]+/i)?.[0]
  if (!origin)
    return apkUrl
  return `${origin}${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`
}

/** 版本清单地址：与 APK 同域，取后台地址 origin + /downloads/android.json */
export function resolveManifestUrl(raw?: string): string {
  const base = String(raw ?? import.meta.env.VITE_APP_SERVER_BASEURL ?? '')
  const origin = base.match(/^https?:\/\/[^/]+/i)?.[0]
  return origin ? `${origin}/downloads/android.json` : ''
}

/**
 * 读取本地 versionCode：plus.runtime.getProperty(plus.runtime.appid) 返回
 * 字符串（manifest.json 的 versionCode），转 int 容错；App 环境异常或字段
 * 缺失时返回 UNKNOWN_VERSION_CODE。
 */
export function getLocalVersionCode(): Promise<number> {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    // vitest 不裁剪条件编译且无 plus 全局：先探测再取值，非 App 运行时落到 UNKNOWN
    const runtime = typeof plus !== 'undefined' ? plus.runtime : null
    if (runtime && runtime.appid) {
      runtime.getProperty(runtime.appid, (info) => {
        const code = toInt(info?.versionCode)
        resolve(Number.isFinite(code) ? code : UNKNOWN_VERSION_CODE)
      })
      return
    }
    // #endif
    resolve(UNKNOWN_VERSION_CODE)
  })
}

/**
 * 拉取版本清单：网络 / 解析 / 字段校验任一失败都静默返回 null，不打扰司机。
 * 清单是静态文件，不走 http.get 封装（无 { code, message, data } 包裹）。
 */
export function checkUpdate(manifestUrl: string): Promise<UpdateManifest | null> {
  if (!manifestUrl)
    return Promise.resolve(null)
  return new Promise((resolve) => {
    uni.request({
      url: manifestUrl,
      method: 'GET',
      timeout: 15000,
      success: res => resolve(parseManifest(res.data)),
      fail: () => resolve(null),
    })
  })
}

function getLastCheckAt(): number {
  const at = toInt(uni.getStorageSync(UPDATE_LAST_CHECK_KEY))
  return Number.isFinite(at) ? at : 0
}

function markChecked(now: number) {
  try {
    uni.setStorageSync(UPDATE_LAST_CHECK_KEY, String(now))
  }
  catch {
    // 存储不可用只影响节流精度，下次启动会多查一次，不影响正确性
  }
}

function promptUpdate(manifest: UpdateManifest, forced: boolean, manifestUrl: string) {
  const suffix = forced ? '当前版本过低，需更新后才能继续使用。' : '建议尽快更新。'
  const content = manifest.notes ? `${manifest.notes}\n\n${suffix}` : `新版本 ${manifest.versionName} 已发布，${suffix}`
  uni.showModal({
    title: forced ? '必须更新' : '发现新版本',
    content,
    // 强制更新 showCancel:false 不可关闭；部分安卓机型可用返回键关掉系统弹窗，关掉就再弹
    showCancel: !forced,
    confirmText: '立即更新',
    cancelText: '稍后再说',
    success: (res) => {
      if (res.confirm)
        downloadAndInstall(manifest, manifestUrl)
      else if (forced)
        promptUpdate(manifest, forced, manifestUrl)
    },
    fail: () => {
      if (forced)
        setTimeout(() => promptUpdate(manifest, forced, manifestUrl), 300)
    },
  })
}

function downloadAndInstall(manifest: UpdateManifest, manifestUrl: string) {
  const apkUrl = resolveApkUrl(manifest.url, manifestUrl)
  uni.showLoading({ title: '正在下载新版本', mask: true })
  uni.downloadFile({
    url: apkUrl,
    success: (res) => {
      uni.hideLoading()
      if (res.statusCode === 200)
        installApk(res.tempFilePath, apkUrl)
      else
        openBrowserFallback(apkUrl)
    },
    fail: () => {
      uni.hideLoading()
      openBrowserFallback(apkUrl)
    },
  })
}

function installApk(apkPath: string, apkUrl: string) {
  // #ifdef APP-PLUS
  // force:false：交给系统安装器处理；安装界面拉起后 App 转入后台
  plus.runtime.install(apkPath, { force: false }, () => {
    // 安装器接管，无需处理
  }, () => {
    openBrowserFallback(apkUrl)
  })
  // #endif
}

/**
 * 安装失败（含「安装未知应用」权限被拒）的统一兜底（设计文档 7.7）：
 * 打开浏览器走系统下载，并引导到系统设置开启安装权限。
 */
function openBrowserFallback(apkUrl: string) {
  // #ifdef APP-PLUS
  plus.runtime.openURL(apkUrl)
  // #endif
  toast('无法直接安装，已转浏览器下载；请到系统设置中允许本应用安装未知应用')
}

/**
 * 启动检查入口：App 每次回到前台时调用（含首次启动），内部统一处理
 * 平台闸门与 24 小时节流；拉取成功才计时，失败下次启动继续尝试。
 * 全程失败静默，不打扰司机。
 */
export function runStartupUpdateCheck(manifestUrl?: string): void {
  if (!isUpdatePlatform())
    return
  const url = manifestUrl || resolveManifestUrl()
  if (!url)
    return
  if (!isCheckDue(getLastCheckAt(), Date.now()))
    return
  checkUpdate(url).then((manifest) => {
    if (!manifest)
      return
    markChecked(Date.now())
    getLocalVersionCode().then((localVersionCode) => {
      const { update, forced } = compareVersion(localVersionCode, manifest)
      if (update)
        promptUpdate(manifest, forced, url)
    })
  })
}
