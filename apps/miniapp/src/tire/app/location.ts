/**
 * 高德定位与地图选点（仅 APP-PLUS 使用）。
 *
 * 坐标统一 GCJ-02，与后端 haversineKm 的距离计算口径一致；
 * 调用前必须已同意隐私政策，未同意时直接拒绝，避免提前初始化高德 SDK。
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
  if (!canInitThirdPartySdk())
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
  if (!canInitThirdPartySdk())
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
