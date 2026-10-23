/** 接口请求：统一响应 { code, message, data }，code===0 返回 data */
import { resolveAppServerBaseUrl } from './app/env'

let BASE: string = import.meta.env.VITE_SERVER_BASEURL || '/api/v1'
// #ifdef MP-WEIXIN
BASE = import.meta.env.VITE_MP_SERVER_BASEURL || BASE
// #endif
// #ifdef APP-PLUS
// 安卓 App 没有同源概念，必须显式配置服务端地址；生产环境强制 HTTPS
// 用 MODE 判断生产：test 等联调模式下 NODE_ENV 仍为 production，不能用 PROD
BASE = resolveAppServerBaseUrl(import.meta.env.VITE_APP_SERVER_BASEURL, import.meta.env.MODE === 'production', BASE)
// #endif

/**
 * 微信云托管：配置了环境 ID 与服务名时，小程序走 wx.cloud.callContainer（走微信内网，不用配置合法域名、不用备案域名）；
 * 未配置时仍按 BASE 发 HTTPS 请求。H5 不受影响。
 */
const CLOUD_ENV = import.meta.env.VITE_WX_CLOUD_ENV || ''
const CLOUD_SERVICE = import.meta.env.VITE_WX_CLOUD_SERVICE || ''
const CLOUD_PATH = import.meta.env.VITE_WX_CLOUD_PATH || '/api/v1'
let cloudReady = false

function toQuery(data?: Record<string, any>) {
  const parts = Object.entries(data || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

interface RawOpts { method: string, url: string, data?: any, header: Record<string, string>, success: (res: { data: any, statusCode: number }) => void, fail: () => void }

function send(o: RawOpts) {
  // #ifdef MP-WEIXIN
  if (CLOUD_ENV && CLOUD_SERVICE) {
    const wxApi = wx as any
    if (!cloudReady) {
      wxApi.cloud.init({ env: CLOUD_ENV })
      cloudReady = true
    }
    const isGet = o.method === 'GET' || o.method === 'DELETE'
    wxApi.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: CLOUD_PATH + o.url + (isGet ? toQuery(o.data) : ''),
      method: o.method,
      data: isGet ? undefined : o.data,
      header: { ...o.header, 'X-WX-SERVICE': CLOUD_SERVICE },
      timeout: 30000,
      success: o.success,
      fail: o.fail,
    })
    return
  }
  // #endif
  uni.request({ url: BASE + o.url, method: o.method as any, data: o.data, timeout: 30000, header: o.header, success: o.success as any, fail: o.fail })
}

export const TOKEN_KEY = 'tire_token'

export function getToken(): string {
  return uni.getStorageSync(TOKEN_KEY) || ''
}

export interface ReqOpts { silent?: boolean, loading?: string }

export class ApiError extends Error {
  constructor(public code: number, message: string, public data?: any) {
    super(message)
  }
}

let redirectingLogin = false

export function request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: any, opts: ReqOpts = {}): Promise<T> {
  const token = getToken()
  if (opts.loading)
    uni.showLoading({ title: opts.loading, mask: true })
  return new Promise((resolve, reject) => {
    send({
      url,
      method,
      data,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      success: (res) => {
        const body: any = res.data
        if (opts.loading)
          uni.hideLoading()
        if (body && body.code === 0)
          return resolve(body.data as T)
        const code = body?.code ?? res.statusCode * 100
        const msg = body?.message || '网络不太好，请稍后再试'
        if (code === 40001) {
          uni.removeStorageSync(TOKEN_KEY)
          if (!opts.silent && !redirectingLogin) {
            redirectingLogin = true
            uni.navigateTo({
              url: '/pkg-auth/login',
              complete: () => setTimeout(() => {
                redirectingLogin = false
              }, 800),
            })
          }
        }
        else if (code === 40003) {
          // 账号被封禁 / 停用：清掉本地令牌并让全局用户态退出，避免继续用旧身份操作
          uni.removeStorageSync(TOKEN_KEY)
          uni.$emit('tire:auth-invalid', msg)
          if (!opts.silent)
            uni.showToast({ title: msg, icon: 'none', duration: 2500 })
        }
        else if (!opts.silent) {
          uni.showToast({ title: msg, icon: 'none', duration: 2500 })
        }
        reject(new ApiError(code, msg, body?.data))
      },
      fail: () => {
        if (opts.loading)
          uni.hideLoading()
        if (!opts.silent)
          uni.showToast({ title: '网络不太好，请稍后再试', icon: 'none' })
        reject(new ApiError(-1, 'network'))
      },
    })
  })
}

export const http = {
  get: <T = any>(url: string, data?: any, opts?: ReqOpts) => request<T>('GET', url, data, opts),
  post: <T = any>(url: string, data?: any, opts?: ReqOpts) => request<T>('POST', url, data, opts),
  put: <T = any>(url: string, data?: any, opts?: ReqOpts) => request<T>('PUT', url, data, opts),
  patch: <T = any>(url: string, data?: any, opts?: ReqOpts) => request<T>('PATCH', url, data, opts),
  del: <T = any>(url: string, data?: any, opts?: ReqOpts) => request<T>('DELETE', url, data, opts),
}

/**
 * 图片上传（multipart/form-data，字段名 file）：后端存数据库并返回 { url: '/uploads/xxx', size }。
 * 云托管 callContainer 模式不支持 multipart 直传，改读文件转 base64 走 JSON 接口（/app/upload-base64）。
 */
function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: r => resolve(r.data as string),
      fail: () => reject(new ApiError(-1, 'network')),
    })
    return
    // #endif
    // #ifndef MP-WEIXIN
    reject(new ApiError(-1, 'network'))
    // #endif
  })
}

export function uploadImage(filePath: string): Promise<{ url: string, size: number }> {
  // #ifdef MP-WEIXIN
  if (CLOUD_ENV && CLOUD_SERVICE) {
    const name = filePath.split('/').pop() || 'photo.jpg'
    return readFileBase64(filePath)
      .then(dataBase64 => request<{ url: string, size: number }>('POST', '/app/upload-base64', { name, dataBase64 }, { loading: '上传中' }))
  }
  // #endif
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE}/app/upload`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${getToken()}` },
      success: (res) => {
        try {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          if (body?.code === 0)
            return resolve(body.data)
          if (body?.code === 40003) {
            uni.removeStorageSync(TOKEN_KEY)
            uni.$emit('tire:auth-invalid', body?.message || '账号已被封禁')
          }
          uni.showToast({ title: body?.message || '上传失败', icon: 'none' })
          reject(new ApiError(body?.code ?? -1, body?.message || '上传失败'))
        }
        catch (e) {
          uni.showToast({ title: '上传失败', icon: 'none' })
          reject(new ApiError(-1, 'parse'))
        }
      },
      fail: () => {
        uni.showToast({ title: '上传失败', icon: 'none' })
        reject(new ApiError(-1, 'network'))
      },
    })
  })
}
