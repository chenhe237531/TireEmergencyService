import { describe, expect, it } from 'vitest'
import { resolveAppServerBaseUrl } from './env'

describe('resolveAppServerBaseUrl', () => {
  it('开发环境允许 HTTP 地址', () => {
    expect(resolveAppServerBaseUrl('http://192.168.1.10:3100/api/v1', false))
      .toBe('http://192.168.1.10:3100/api/v1')
  })

  it('生产环境允许 HTTPS 地址并去掉末尾斜杠', () => {
    expect(resolveAppServerBaseUrl('https://api.example.com/api/v1/', true))
      .toBe('https://api.example.com/api/v1')
  })

  it('生产环境拒绝 HTTP 地址', () => {
    expect(() => resolveAppServerBaseUrl('http://api.example.com/api/v1', true))
      .toThrow(/HTTPS/)
  })

  it('生产环境缺少配置直接失败', () => {
    expect(() => resolveAppServerBaseUrl('', true))
      .toThrow(/VITE_APP_SERVER_BASEURL/)
  })

  it('开发环境缺少配置回退到默认相对路径', () => {
    expect(resolveAppServerBaseUrl(undefined, false)).toBe('/api/v1')
  })
})
