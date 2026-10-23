import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPendingPhoto,
  attachPendingPhotosToConsult,
  loadPendingPhotos,
  pendingFormPhotos,
  pendingPhotosForConsult,
  persistPhotoCopy,
  PHOTO_QUEUE_KEY,
  removePendingPhotos,
} from './photoQueue'

describe('咨询照片待上传队列', () => {
  const storage = new Map<string, any>()

  beforeEach(() => {
    storage.clear()
    ;(uni as any).saveFile = vi.fn()
    vi.mocked(uni.getStorageSync).mockImplementation((key: string) => storage.get(key) ?? '')
    vi.mocked(uni.setStorageSync).mockImplementation((key: string, value: any) => {
      storage.set(key, value)
    })
    vi.mocked(uni.removeStorageSync).mockImplementation((key: string) => {
      storage.delete(key)
    })
  })

  it('上传失败入队：保留本地副本路径，读取时可恢复', () => {
    addPendingPhoto('wxfile://saved/a.jpg')

    const list = loadPendingPhotos()
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe('wxfile://saved/a.jpg')
    expect(list[0].consultId).toBeNull()
    expect(typeof list[0].id).toBe('string')
  })

  it('同一张照片（同路径）重复失败不重复入队', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    addPendingPhoto('wxfile://saved/a.jpg')

    expect(loadPendingPhotos()).toHaveLength(1)
  })

  it('重试成功出队：队列清空后存储键一并删除', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    addPendingPhoto('wxfile://saved/b.jpg')
    expect(storage.has(PHOTO_QUEUE_KEY)).toBe(true)

    removePendingPhotos(['wxfile://saved/a.jpg'])
    expect(loadPendingPhotos().map(p => p.path)).toEqual(['wxfile://saved/b.jpg'])

    removePendingPhotos(['wxfile://saved/b.jpg'])
    expect(loadPendingPhotos()).toEqual([])
    expect(storage.has(PHOTO_QUEUE_KEY)).toBe(false)
  })

  it('出队只移除指定路径，不影响其他照片（失败不阻塞其他图片）', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    addPendingPhoto('wxfile://saved/b.jpg')
    addPendingPhoto('wxfile://saved/c.jpg')

    removePendingPhotos(['wxfile://saved/b.jpg'])

    expect(loadPendingPhotos().map(p => p.path)).toEqual(['wxfile://saved/a.jpg', 'wxfile://saved/c.jpg'])
  })

  it('文字提交成功后：未关联的条目挂到咨询记录，不再回到咨询表单', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    addPendingPhoto('wxfile://saved/b.jpg')

    attachPendingPhotosToConsult(42)

    expect(pendingFormPhotos()).toEqual([])
    expect(pendingPhotosForConsult(42).map(p => p.path)).toEqual(['wxfile://saved/a.jpg', 'wxfile://saved/b.jpg'])
  })

  it('按咨询记录过滤待补传照片：其他记录的条目不受影响', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    attachPendingPhotosToConsult(42)
    addPendingPhoto('wxfile://saved/c.jpg')
    attachPendingPhotosToConsult(43)

    expect(pendingPhotosForConsult(42).map(p => p.path)).toEqual(['wxfile://saved/a.jpg'])
    expect(pendingPhotosForConsult(43).map(p => p.path)).toEqual(['wxfile://saved/c.jpg'])
    expect(pendingFormPhotos()).toEqual([])
  })

  it('队列超过 9 张时淘汰最早的条目（与表单上限一致）', () => {
    for (let i = 0; i < 11; i++)
      addPendingPhoto(`wxfile://saved/${i}.jpg`)

    const list = loadPendingPhotos()
    expect(list).toHaveLength(9)
    expect(list[0].path).toBe('wxfile://saved/2.jpg')
    expect(list[8].path).toBe('wxfile://saved/10.jpg')
  })

  it('补传成功出队后，记录的待补传列表随之清空', () => {
    addPendingPhoto('wxfile://saved/a.jpg')
    addPendingPhoto('wxfile://saved/b.jpg')
    attachPendingPhotosToConsult(42)

    // 补传两张都成功
    removePendingPhotos(['wxfile://saved/a.jpg', 'wxfile://saved/b.jpg'])

    expect(pendingPhotosForConsult(42)).toEqual([])
    expect(loadPendingPhotos()).toEqual([])
  })

  it('存储内容损坏时按空队列处理，不抛错', () => {
    storage.set(PHOTO_QUEUE_KEY, 'not-an-array')
    expect(loadPendingPhotos()).toEqual([])

    storage.set(PHOTO_QUEUE_KEY, [{ noPath: true }, null, { path: 'wxfile://ok.jpg' }])
    const list = loadPendingPhotos()
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe('wxfile://ok.jpg')
  })
})

describe('保留照片本地副本 persistPhotoCopy', () => {
  beforeEach(() => {
    ;(uni as any).saveFile = vi.fn()
  })

  it('saveFile 成功：返回持久化路径，后续重试用它', async () => {
    ;(uni as any).saveFile.mockImplementation((o: any) => {
      expect(o.tempFilePath).toBe('tmp://a.jpg')
      o.success({ savedFilePath: 'wxfile://saved/a.jpg' })
    })

    await expect(persistPhotoCopy('tmp://a.jpg')).resolves.toBe('wxfile://saved/a.jpg')
  })

  it('saveFile 失败：回退原路径（尽力而为，会话内重试仍可用）', async () => {
    ;(uni as any).saveFile.mockImplementation((o: any) => {
      o.fail({ errMsg: 'saveFile:fail' })
    })

    await expect(persistPhotoCopy('tmp://a.jpg')).resolves.toBe('tmp://a.jpg')
  })
})
