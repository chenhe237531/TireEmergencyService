import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canAddPhotos, COMPRESS_QUALITY_STEPS, PHOTO_COMPRESS_BYTES, PHOTO_MAX_BYTES, PHOTO_MAX_COUNT, planPhoto, preparePhoto } from './photo'

const MB = 1024 * 1024

describe('照片大小决策 planPhoto', () => {
  it('阈值常量：最多 9 张、单张上限 5MB、压缩目标 2MB', () => {
    expect(PHOTO_MAX_COUNT).toBe(9)
    expect(PHOTO_MAX_BYTES).toBe(5 * MB)
    expect(PHOTO_COMPRESS_BYTES).toBe(2 * MB)
  })

  it('2MB 以内（含恰好 2MB）原图直传', () => {
    expect(planPhoto(0)).toBe('use')
    expect(planPhoto(1024)).toBe('use')
    expect(planPhoto(2 * MB)).toBe('use')
  })

  it('2MB ~ 5MB（含恰好 5MB）先压缩再上传', () => {
    expect(planPhoto(2 * MB + 1)).toBe('compress')
    expect(planPhoto(4 * MB)).toBe('compress')
    expect(planPhoto(5 * MB)).toBe('compress')
  })

  it('超过 5MB 拒绝（提示换一张）', () => {
    expect(planPhoto(5 * MB + 1)).toBe('reject')
    expect(planPhoto(20 * MB)).toBe('reject')
  })
})

describe('照片张数上限 canAddPhotos', () => {
  it('总数不超过 9 张时允许添加', () => {
    expect(canAddPhotos(0, 1)).toBe(true)
    expect(canAddPhotos(0, 9)).toBe(true)
    expect(canAddPhotos(8, 1)).toBe(true)
  })

  it('总数超过 9 张时阻止', () => {
    expect(canAddPhotos(9, 1)).toBe(false)
    expect(canAddPhotos(8, 2)).toBe(false)
    expect(canAddPhotos(0, 10)).toBe(false)
  })
})

describe('压缩执行 preparePhoto', () => {
  beforeEach(() => {
    ;(uni as any).compressImage = vi.fn()
    ;(uni as any).getFileInfo = vi.fn()
  })

  it('原图 ≤ 2MB 时不压缩，原样返回', async () => {
    await expect(preparePhoto('tmp://a.jpg', 1.5 * MB)).resolves.toEqual({ path: 'tmp://a.jpg', size: 1.5 * MB })
    expect((uni as any).compressImage).not.toHaveBeenCalled()
  })

  it('超过 5MB 的原图不做压缩准备（页面按 planPhoto 已拒绝，不走到这里）', async () => {
    await expect(preparePhoto('tmp://big.jpg', 6 * MB)).resolves.toEqual({ path: 'tmp://big.jpg', size: 6 * MB })
    expect((uni as any).compressImage).not.toHaveBeenCalled()
  })

  it('超 2MB 时压缩一轮进入 2MB 即停止', async () => {
    ;(uni as any).compressImage.mockImplementation((o: any) => {
      expect(o.src).toBe('tmp://a.jpg')
      expect(o.quality).toBe(COMPRESS_QUALITY_STEPS[0])
      o.success({ tempFilePath: 'tmp://a-q80.jpg' })
    })
    ;(uni as any).getFileInfo.mockImplementation((o: any) => {
      o.success({ size: 1.2 * MB })
    })

    await expect(preparePhoto('tmp://a.jpg', 3 * MB)).resolves.toEqual({ path: 'tmp://a-q80.jpg', size: 1.2 * MB })
    expect((uni as any).compressImage).toHaveBeenCalledTimes(1)
  })

  it('第一轮仍超 2MB 时继续降质量压缩，直到进入 2MB', async () => {
    const outputs = ['tmp://a-q80.jpg', 'tmp://a-q60.jpg']
    const sizes = [2.4 * MB, 1.8 * MB]
    ;(uni as any).compressImage.mockImplementation((o: any) => {
      o.success({ tempFilePath: outputs.shift() })
    })
    ;(uni as any).getFileInfo.mockImplementation((o: any) => {
      o.success({ size: sizes.shift() })
    })

    await expect(preparePhoto('tmp://a.jpg', 4 * MB)).resolves.toEqual({ path: 'tmp://a-q60.jpg', size: 1.8 * MB })
    expect((uni as any).compressImage).toHaveBeenCalledTimes(2)
  })

  it('压缩质量轮次用尽仍超 2MB：返回最后一轮结果（远小于 5MB 可直传）', async () => {
    ;(uni as any).compressImage.mockImplementation((o: any) => {
      o.success({ tempFilePath: `tmp://a-q${o.quality}.jpg` })
    })
    ;(uni as any).getFileInfo.mockImplementation((o: any) => {
      o.success({ size: 2.5 * MB })
    })

    const r = await preparePhoto('tmp://a.jpg', 4.8 * MB)
    expect(r.path).toBe('tmp://a-q40.jpg')
    expect((uni as any).compressImage).toHaveBeenCalledTimes(COMPRESS_QUALITY_STEPS.length)
  })

  it('平台不支持压缩（compressImage fail）：回退原图（≤ 5MB 由服务端兜底）', async () => {
    ;(uni as any).compressImage.mockImplementation((o: any) => {
      o.fail({ errMsg: 'compressImage:fail not support' })
    })

    await expect(preparePhoto('tmp://a.png', 3 * MB)).resolves.toEqual({ path: 'tmp://a.png', size: 3 * MB })
  })

  it('压缩后大小查询失败（getFileInfo fail）：按未知大小返回压缩结果', async () => {
    ;(uni as any).compressImage.mockImplementation((o: any) => {
      o.success({ tempFilePath: 'tmp://a-q80.jpg' })
    })
    ;(uni as any).getFileInfo.mockImplementation((o: any) => {
      o.fail({})
    })

    await expect(preparePhoto('tmp://a.jpg', 3 * MB)).resolves.toEqual({ path: 'tmp://a-q80.jpg', size: 0 })
  })
})
