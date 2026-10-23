/**
 * /app/settings 客户端缓存：分享标题、demoLogin 标记等多入口共用，
 * 进程内只拉一次，避免每个页面各发一个请求。
 * 需要最新内容的页面（关于 / 客服）仍直接 http.get，不走这里的缓存。
 */
import { http } from './request'
import type { AppSettings } from './types'

let cache: Promise<Partial<AppSettings>> | null = null

export function loadAppSettings(force = false): Promise<Partial<AppSettings>> {
  if (force || !cache)
    cache = http.get<Partial<AppSettings>>('/app/settings', undefined, { silent: true }).catch(() => ({}))
  return cache
}
