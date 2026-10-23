import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseLocationOnMap, getCurrentLocation, isPrivacyGatePlatform, joinLocationDesc, PRIVACY_REQUIRED } from './location'
import { acceptPrivacy } from './privacy'

describe('地图选点位置描述', () => {
  it('拼接名称与地址', () => {
    expect(joinLocationDesc('郑州东站', '河南省郑州市金水区心怡路')).toBe('郑州东站 河南省郑州市金水区心怡路')
  })

  it('地址已包含名称时不重复拼接', () => {
    expect(joinLocationDesc('郑州东站', '郑州东站南广场')).toBe('郑州东站南广场')
  })

  it('超过 200 字截断', () => {
    expect(joinLocationDesc('a'.repeat(150), 'b'.repeat(100))).toHaveLength(200)
  })
})

describe('定位与地图 SDK 隐私闸门', () => {
  beforeEach(() => {
    vi.mocked(uni.getStorageSync).mockReturnValue('')
  })

  /**
   * vitest 不做条件编译，测试环境按 App 语义运行（闸门生效）；
   * mp-weixin / h5 构建时 isPrivacyGatePlatform 的 true 分支被裁掉，
   * 闸门整体失效、沿用系统定位 —— 这是 issue #14 回归的保护性断言。
   */
  it('测试环境按 App 语义运行（闸门生效）', () => {
    expect(isPrivacyGatePlatform()).toBe(true)
  })

  it('未同意隐私政策时不调用定位（App 端不初始化高德 SDK）', async () => {
    await expect(getCurrentLocation()).rejects.toThrow(PRIVACY_REQUIRED)
    expect(uni.getLocation).not.toHaveBeenCalled()
  })

  it('未同意隐私政策时不打开地图选点', async () => {
    await expect(chooseLocationOnMap()).rejects.toThrow(PRIVACY_REQUIRED)
    expect(uni.chooseLocation).not.toHaveBeenCalled()
  })

  it('同意后按 GCJ-02 + 高德定位取坐标', async () => {
    acceptPrivacy()
    vi.mocked(uni.getStorageSync).mockReturnValue('1')
    vi.mocked(uni.getLocation).mockImplementation((options) => {
      options?.success?.({
        latitude: 34.75,
        longitude: 113.76,
      } as UniNamespace.GetLocationSuccess)
    })

    await expect(getCurrentLocation()).resolves.toEqual({ lat: 34.75, lng: 113.76 })
    expect(uni.getLocation).toHaveBeenCalledWith(expect.objectContaining({ type: 'gcj02', provider: 'amap' }))
  })

  it('选点结果回填位置描述', async () => {
    vi.mocked(uni.getStorageSync).mockReturnValue('1')
    vi.mocked(uni.chooseLocation).mockImplementation((options) => {
      options?.success?.({
        name: '郑州东站',
        address: '河南省郑州市金水区心怡路',
        latitude: 34.75,
        longitude: 113.76,
      } as UniNamespace.ChooseLocationSuccess)
    })

    await expect(chooseLocationOnMap()).resolves.toEqual({
      lat: 34.75,
      lng: 113.76,
      desc: '郑州东站 河南省郑州市金水区心怡路',
    })
  })
})
