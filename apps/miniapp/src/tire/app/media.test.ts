import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyAlbumSaveError, saveImageToAlbum } from './media'

describe('相册保存失败分类', () => {
  it('授权拒绝类报错识别为权限问题', () => {
    expect(classifyAlbumSaveError('saveImageToPhotosAlbum:fail auth deny')).toBe('denied')
    expect(classifyAlbumSaveError('saveImageToPhotosAlbum:fail authorize no response')).toBe('denied')
    expect(classifyAlbumSaveError('saveImageToPhotosAlbum:fail no permission')).toBe('denied')
    expect(classifyAlbumSaveError('保存失败：无存储权限')).toBe('denied')
  })

  it('其他报错按普通失败处理，不引导去系统设置', () => {
    expect(classifyAlbumSaveError('saveImageToPhotosAlbum:fail file not found')).toBe('failed')
    expect(classifyAlbumSaveError('')).toBe('failed')
  })
})

describe('保存图片到相册', () => {
  beforeEach(() => {
    vi.mocked(uni.saveImageToPhotosAlbum).mockReset()
  })

  it('保存成功返回 saved', async () => {
    vi.mocked(uni.saveImageToPhotosAlbum).mockImplementation((options: any) => {
      options.success({})
    })
    await expect(saveImageToAlbum('file://poster.png')).resolves.toBe('saved')
    expect(uni.saveImageToPhotosAlbum).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'file://poster.png' }))
  })

  it('授权被拒返回 denied（调用方据此引导去系统设置）', async () => {
    vi.mocked(uni.saveImageToPhotosAlbum).mockImplementation((options: any) => {
      options.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' })
    })
    await expect(saveImageToAlbum('file://poster.png')).resolves.toBe('denied')
  })

  it('其他失败返回 failed，不误判为权限问题', async () => {
    vi.mocked(uni.saveImageToPhotosAlbum).mockImplementation((options: any) => {
      options.fail({ errMsg: 'saveImageToPhotosAlbum:fail io error' })
    })
    await expect(saveImageToAlbum('file://poster.png')).resolves.toBe('failed')
  })
})
