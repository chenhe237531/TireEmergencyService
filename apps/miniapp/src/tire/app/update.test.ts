import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkUpdate,
  compareVersion,
  getLocalVersionCode,
  isCheckDue,
  isUpdatePlatform,
  parseManifest,
  resolveApkUrl,
  runStartupUpdateCheck,
  UNKNOWN_VERSION_CODE,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_LAST_CHECK_KEY,
} from './update'
import type { UpdateManifest } from './update'

const MANIFEST_URL = 'https://api.example.com/downloads/android.json'

function manifest(over: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    versionCode: 101,
    versionName: '1.0.1',
    url: '/downloads/tire-1.0.1-101.apk',
    notes: '修复定位问题',
    minVersionCode: 100,
    ...over,
  }
}

function stubPlus(versionCode: string) {
  vi.stubGlobal('plus', {
    runtime: {
      appid: '__UNI__TIRE001',
      getProperty: (_appid: string, cb: (info: { versionCode?: string }) => void) => cb({ versionCode }),
    },
  })
}

/** mock uni.request 一次响应，模拟拉取清单 */
function mockManifestResponse(data: unknown, statusCode = 200) {
  vi.mocked(uni.request).mockImplementationOnce((opts: any) => {
    opts.success({ data, statusCode })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('compareVersion', () => {
  it('本地与清单 versionCode 相等时无更新', () => {
    expect(compareVersion(101, manifest())).toEqual({ update: false, forced: false })
  })

  it('本地比清单新时无更新', () => {
    expect(compareVersion(102, manifest()).update).toBe(false)
  })

  it('本地低于 minVersionCode 时强制更新', () => {
    expect(compareVersion(100, manifest({ minVersionCode: 101 }))).toEqual({ update: true, forced: true })
  })

  it('本地等于 minVersionCode 时为可选更新（边界不含）', () => {
    expect(compareVersion(100, manifest({ minVersionCode: 100 }))).toEqual({ update: true, forced: false })
  })

  it('minVersionCode 为 0 时全部走可选更新', () => {
    expect(compareVersion(100, manifest({ minVersionCode: 0 }))).toEqual({ update: true, forced: false })
  })

  it('本地 versionCode 读取失败时按无更新处理，不会误判强更', () => {
    expect(compareVersion(UNKNOWN_VERSION_CODE, manifest({ minVersionCode: 999 }))).toEqual({ update: false, forced: false })
  })

  it('清单异常（不高于本地）时即使本地低于 minVersionCode 也不打扰司机', () => {
    expect(compareVersion(99, manifest({ versionCode: 99, minVersionCode: 100 }))).toEqual({ update: false, forced: false })
  })
})

describe('isCheckDue', () => {
  const NOW = 1_700_000_000_000

  it('从未检查过时需要检查', () => {
    expect(isCheckDue(0, NOW)).toBe(true)
  })

  it('距上次检查不足 24 小时时跳过', () => {
    expect(isCheckDue(NOW - UPDATE_CHECK_INTERVAL_MS + 1, NOW)).toBe(false)
  })

  it('距上次检查恰好 24 小时时需要检查', () => {
    expect(isCheckDue(NOW - UPDATE_CHECK_INTERVAL_MS, NOW)).toBe(true)
  })

  it('检查时间异常（负值 / 非数字）时视为需要检查', () => {
    expect(isCheckDue(-1, NOW)).toBe(true)
    expect(isCheckDue(Number.NaN, NOW)).toBe(true)
  })
})

describe('parseManifest', () => {
  it('合法清单：完整字段解析', () => {
    expect(parseManifest({
      versionCode: 101,
      versionName: '1.0.1',
      url: '/downloads/tire.apk',
      notes: '修复定位问题',
      minVersionCode: 100,
    })).toEqual(manifest({ url: '/downloads/tire.apk' }))
  })

  it('versionCode 为数字字符串时容错转 int', () => {
    expect(parseManifest({
      versionCode: '101',
      versionName: '1.0.1',
      url: 'https://a.com/t.apk',
      minVersionCode: '100',
    })?.versionCode).toBe(101)
  })

  it('notes 缺省时置空', () => {
    const m = parseManifest({ versionCode: 1, versionName: '1.0.0', url: '/x.apk', minVersionCode: 0 })
    expect(m?.notes).toBeUndefined()
  })

  it('缺 versionCode / minVersionCode 时拒绝', () => {
    expect(parseManifest({ versionName: '1.0.1', url: '/x.apk', minVersionCode: 0 })).toBeNull()
    expect(parseManifest({ versionCode: 1, versionName: '1.0.1', url: '/x.apk' })).toBeNull()
  })

  it('缺 versionName / url 时拒绝', () => {
    expect(parseManifest({ versionCode: 1, url: '/x.apk', minVersionCode: 0 })).toBeNull()
    expect(parseManifest({ versionCode: 1, versionName: '1.0.1', minVersionCode: 0 })).toBeNull()
  })

  it('url 非法（既不是 http(s) 也不以 / 开头）或 versionCode 非正数时拒绝', () => {
    expect(parseManifest({ versionCode: 1, versionName: '1.0.1', url: 'ftp://a.com/x.apk', minVersionCode: 0 })).toBeNull()
    expect(parseManifest({ versionCode: 0, versionName: '1.0.1', url: '/x.apk', minVersionCode: 0 })).toBeNull()
  })

  it('非对象输入拒绝', () => {
    expect(parseManifest(null)).toBeNull()
    expect(parseManifest('x')).toBeNull()
  })
})

describe('resolveApkUrl', () => {
  it('绝对地址原样返回', () => {
    expect(resolveApkUrl('https://cdn.example.com/x.apk', MANIFEST_URL))
      .toBe('https://cdn.example.com/x.apk')
  })

  it('根相对路径按清单域名补全', () => {
    expect(resolveApkUrl('/downloads/x.apk', MANIFEST_URL))
      .toBe('https://api.example.com/downloads/x.apk')
  })

  it('裸文件名按清单域名 + / 补全', () => {
    expect(resolveApkUrl('x.apk', MANIFEST_URL))
      .toBe('https://api.example.com/x.apk')
  })
})

describe('checkUpdate', () => {
  it('拉取成功返回解析后的清单', async () => {
    mockManifestResponse({ versionCode: 101, versionName: '1.0.1', url: '/downloads/x.apk', notes: 'x', minVersionCode: 100 })
    expect(await checkUpdate(MANIFEST_URL)).toEqual(manifest({ url: '/downloads/x.apk', notes: 'x' }))
  })

  it('网络失败静默返回 null', async () => {
    vi.mocked(uni.request).mockImplementationOnce((opts: any) => {
      opts.fail({})
    })
    expect(await checkUpdate(MANIFEST_URL)).toBeNull()
  })

  it('返回内容不合法时返回 null（静默按无更新）', async () => {
    mockManifestResponse({ foo: 1 })
    expect(await checkUpdate(MANIFEST_URL)).toBeNull()
  })
})

describe('getLocalVersionCode', () => {
  it('plus 环境不可用时容错返回 UNKNOWN', async () => {
    expect(await getLocalVersionCode()).toBe(UNKNOWN_VERSION_CODE)
  })

  it('读取 plus.runtime 的字符串 versionCode 并转 int', async () => {
    stubPlus('100')
    expect(await getLocalVersionCode()).toBe(100)
  })

  it('versionCode 字段非法时容错返回 UNKNOWN', async () => {
    stubPlus('abc')
    expect(await getLocalVersionCode()).toBe(UNKNOWN_VERSION_CODE)
  })
})

describe('runStartupUpdateCheck', () => {
  it('测试环境按 App 语义运行（vitest 不裁剪条件编译）', () => {
    expect(isUpdatePlatform()).toBe(true)
  })

  it('无新版本时不打扰司机，且记录检查时间供 24 小时节流', async () => {
    stubPlus('101')
    mockManifestResponse(manifest())
    runStartupUpdateCheck(MANIFEST_URL)
    await vi.waitFor(() => {
      expect(uni.setStorageSync).toHaveBeenCalledWith(UPDATE_LAST_CHECK_KEY, expect.any(String))
    })
    expect(uni.showModal).not.toHaveBeenCalled()
  })

  it('可选更新：可关闭的更新提示（showCancel: true）', async () => {
    stubPlus('100')
    mockManifestResponse(manifest({ minVersionCode: 100 }))
    runStartupUpdateCheck(MANIFEST_URL)
    await vi.waitFor(() => {
      expect(uni.showModal).toHaveBeenCalledWith(expect.objectContaining({ showCancel: true }))
    })
  })

  it('强制更新：不可关闭的弹窗（showCancel: false）', async () => {
    stubPlus('100')
    mockManifestResponse(manifest({ minVersionCode: 101 }))
    runStartupUpdateCheck(MANIFEST_URL)
    await vi.waitFor(() => {
      expect(uni.showModal).toHaveBeenCalledWith(expect.objectContaining({ showCancel: false }))
    })
  })

  it('确认更新后下载 APK（清单相对地址按域名补全）', async () => {
    stubPlus('100')
    mockManifestResponse(manifest())
    vi.mocked(uni.showModal).mockImplementationOnce((opts: any) => {
      opts.success({ confirm: true })
    })
    ;(uni as any).downloadFile = vi.fn()
    runStartupUpdateCheck(MANIFEST_URL)
    await vi.waitFor(() => {
      expect(uni.downloadFile).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://api.example.com/downloads/tire-1.0.1-101.apk',
      }))
    })
    delete (uni as any).downloadFile
  })

  it('24 小时内已检查过时跳过，不发请求', () => {
    stubPlus('100')
    vi.mocked(uni.getStorageSync).mockReturnValue(String(Date.now() - UPDATE_CHECK_INTERVAL_MS + 60 * 60 * 1000))
    runStartupUpdateCheck(MANIFEST_URL)
    expect(uni.request).not.toHaveBeenCalled()
  })

  it('拉取失败静默且不计时，下次启动继续尝试', async () => {
    stubPlus('100')
    vi.mocked(uni.request).mockImplementationOnce((opts: any) => {
      opts.fail({})
    })
    runStartupUpdateCheck(MANIFEST_URL)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(uni.setStorageSync).not.toHaveBeenCalledWith(UPDATE_LAST_CHECK_KEY, expect.any(String))
    expect(uni.showModal).not.toHaveBeenCalled()
  })
})
