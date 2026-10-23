/**
 * 安卓 App 环境配置：仅 APP-PLUS 使用。
 *
 * 接口地址由 VITE_APP_SERVER_BASEURL 决定；生产环境必须 HTTPS，
 * 避免安卓端误连明文地址（H5 继续走相对路径，小程序走 VITE_MP_SERVER_BASEURL）。
 */
export function resolveAppServerBaseUrl(raw: string | undefined, isProd: boolean, fallback = '/api/v1'): string {
  const value = String(raw || '').trim()
  if (!value) {
    if (isProd)
      throw new Error('生产环境缺少 VITE_APP_SERVER_BASEURL：安卓 App 必须显式配置 HTTPS 接口地址')
    return fallback
  }
  if (isProd && !/^https:\/\//i.test(value))
    throw new Error(`生产环境 VITE_APP_SERVER_BASEURL 必须使用 HTTPS，当前为 ${value}`)
  return value.replace(/\/+$/, '')
}
