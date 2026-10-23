/**
 * 高德定位与地图选点。
 *
 * 坐标统一 GCJ-02，与后端 haversineKm 的距离计算口径一致；
 * App 端调用前必须已同意隐私政策，未同意时直接拒绝，避免提前初始化高德 SDK。
 * 小程序 / H5 不经高德 SDK，隐私闸门按平台条件编译移除，沿用系统定位（issue #14 回归修复）。
 */
import { canInitThirdPartySdk } from './privacy'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface PickedLocation extends GeoPoint {
  desc: string
}

export const PRIVACY_REQUIRED = 'privacy-consent-required'

/**
 * 隐私闸门是否作用于当前平台：仅 App 端为 true。
 * 注意：vitest 不做条件编译，测试环境按 App 语义运行（恒为 true）；
 * mp-weixin / h5 构建时上面的分支会被裁掉，恒为 false。
 */
export function isPrivacyGatePlatform(): boolean {
  // #ifdef APP-PLUS
  return true
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

/** 未同意隐私政策时阻断第三方定位 / 地图 SDK 初始化（仅 App 端生效） */
export function locationBlockedByPrivacy(): boolean {
  return isPrivacyGatePlatform() && !canInitThirdPartySdk()
}

/** 地图选点的名称与地址拼接为位置描述，最多 200 字（与后端 locationDesc 截断一致） */
export function joinLocationDesc(name?: string, address?: string): string {
  const n = String(name || '').trim()
  const a = String(address || '').trim()
  // 地址常已包含名称，避免拼出「郑州东站 郑州东站南广场」这类重复文案
  const text = n && a && !a.includes(n) ? `${n} ${a}` : a || n
  return text.slice(0, 200)
}

/** 高德定位：App 端显式指定 provider=amap，其他端沿用系统定位 */
export function getCurrentLocation(): Promise<GeoPoint> {
  if (locationBlockedByPrivacy())
    return Promise.reject(new Error(PRIVACY_REQUIRED))
  return new Promise((resolve, reject) => {
    const options: UniNamespace.GetLocationOptions & { provider?: 'amap' } = {
      type: 'gcj02',
      // #ifdef APP-PLUS
      provider: 'amap',
      // #endif
      success: res => resolve({ lat: res.latitude, lng: res.longitude }),
      fail: reject,
    }
    uni.getLocation(options)
  })
}

/** 地图选点：返回 GCJ-02 坐标，并把名称 + 地址拼成位置描述 */
export function chooseLocationOnMap(origin?: GeoPoint | null): Promise<PickedLocation> {
  if (locationBlockedByPrivacy())
    return Promise.reject(new Error(PRIVACY_REQUIRED))
  return new Promise((resolve, reject) => {
    uni.chooseLocation({
      latitude: origin?.lat,
      longitude: origin?.lng,
      success: res => resolve({
        lat: res.latitude,
        lng: res.longitude,
        desc: joinLocationDesc(res.name, res.address),
      }),
      fail: reject,
    })
  })
}
