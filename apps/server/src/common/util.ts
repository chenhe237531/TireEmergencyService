import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import dayjs from 'dayjs'

export const now = () => new Date()
export const addDays = (d: number, from = new Date()) => new Date(from.getTime() + d * 86400_000)
export const fmt = (d?: Date | string | null, f = 'YYYY-MM-DD HH:mm') => (d ? dayjs(d).format(f) : '')
export const today = () => dayjs().format('YYYY-MM-DD')

/** 密码哈希：scrypt + 随机盐，格式 scrypt$salt$hash；旧版 sha256 仍可校验并在登录时自动升级 */
export function hashPwd(pwd: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(`tire:${pwd}`, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPwd(pwd: string, stored: string) {
  if (!stored) return false
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$')
    if (!salt || !hash) return false
    const next = scryptSync(`tire:${pwd}`, salt, 64)
    const prev = Buffer.from(hash, 'hex')
    return prev.length === next.length && timingSafeEqual(prev, next)
  }
  // 兼容旧库：sha256 哈希
  return createHash('sha256').update(`tire:${pwd}`).digest('hex') === stored
}

export function maskPhone(p?: string | null) {
  if (!p) return ''
  return p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

/** 球面距离（公里）：门店按司机位置由近到远排序 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 距离展示文案：850m / 1.5km / 12km */
export function distanceLabel(km?: number | null) {
  if (km == null) return ''
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)}m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)}km`
}

/** 随机文件名：时间戳 + 随机串，保留原始扩展名 */
export function genFileName(origName: string) {
  const ext = (origName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${Date.now()}_${randomBytes(6).toString('hex')}.${ext || 'jpg'}`
}

export function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  const r: any = {}
  keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k] })
  return r as Pick<T, K>
}
