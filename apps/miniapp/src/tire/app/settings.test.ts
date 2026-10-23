import { describe, expect, it } from 'vitest'
import {
  buildPosterContent,
  buildShareMessage,
  FALLBACK_SHARE_TITLE,
  ICP_PLACEHOLDER,
  icpNumberText,
  normalizeSettings,
} from './settings'

describe('normalizeSettings 平台设置兜底', () => {
  it('空入参也能得到完整结构', () => {
    const s = normalizeSettings(null)
    expect(s.servicePhone).toBe('')
    expect(s.shareTitle).toBe(FALLBACK_SHARE_TITLE)
    expect(s.icpNumber).toBe('')
    expect(s.h5Url).toBe('')
  })

  it('保留后台配置的取值并去除首尾空白', () => {
    const s = normalizeSettings({
      servicePhone: ' 400-100-8666 ',
      shareTitle: ' 轮胎救援找小蚂蚁 ',
      icpNumber: ' 豫ICP备12345678号 ',
      h5Url: ' https://h5.example.com ',
    })
    expect(s.servicePhone).toBe('400-100-8666')
    expect(s.shareTitle).toBe('轮胎救援找小蚂蚁')
    expect(s.icpNumber).toBe('豫ICP备12345678号')
    expect(s.h5Url).toBe('https://h5.example.com')
  })

  it('shareTitle 为空时回退默认文案', () => {
    expect(normalizeSettings({ shareTitle: '' }).shareTitle).toBe(FALLBACK_SHARE_TITLE)
    expect(normalizeSettings({ shareTitle: '  ' }).shareTitle).toBe(FALLBACK_SHARE_TITLE)
  })
})

describe('关于页备案号文案', () => {
  it('配置了备案号时展示真实值', () => {
    expect(icpNumberText('豫ICP备12345678号-2A')).toBe('App 备案号：豫ICP备12345678号-2A')
  })

  it('未配置时展示占位文案（发布前填入）', () => {
    expect(icpNumberText('')).toContain(ICP_PLACEHOLDER)
    expect(icpNumberText('   ')).toContain(ICP_PLACEHOLDER)
  })
})

describe('分享文案组装', () => {
  it('标题 + 说明 + 链接用全角分隔符拼接', () => {
    const msg = buildShareMessage('轮胎救援找小蚂蚁', 'https://h5.example.com')
    expect(msg).toBe('轮胎救援找小蚂蚁｜24 小时轮胎救援 · 平台调度 · 就近安排门店上门服务｜https://h5.example.com')
  })

  it('链接未配置时不拼空链接', () => {
    const msg = buildShareMessage('轮胎救援找小蚂蚁', '')
    expect(msg).not.toContain('https')
    expect(msg).toContain('轮胎救援找小蚂蚁')
  })

  it('标题为空时回退默认文案', () => {
    expect(buildShareMessage('', '').startsWith(FALLBACK_SHARE_TITLE)).toBe(true)
  })
})

describe('海报与系统分享内容组装', () => {
  it('组装标题 / 链接 / 完整文案 / 客服电话', () => {
    const s = normalizeSettings({
      shareTitle: '轮胎救援找小蚂蚁',
      servicePhone: '400-100-8666',
      h5Url: 'https://h5.example.com',
    })
    const poster = buildPosterContent(s)
    expect(poster.title).toBe('轮胎救援找小蚂蚁')
    expect(poster.href).toBe('https://h5.example.com')
    expect(poster.phone).toBe('400-100-8666')
    expect(poster.message).toContain('https://h5.example.com')
  })

  it('后台未配置时全部走兜底，链接为空', () => {
    const poster = buildPosterContent(normalizeSettings({}))
    expect(poster.title).toBe(FALLBACK_SHARE_TITLE)
    expect(poster.href).toBe('')
    expect(poster.phone).toBe('')
    expect(poster.message).not.toContain('https')
  })
})
