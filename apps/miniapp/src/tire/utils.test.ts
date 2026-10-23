import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSubmitRequestId, submitRequestId } from './utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('提交幂等键', () => {
  const storage = new Map<string, any>()

  beforeEach(() => {
    storage.clear()
    vi.mocked(uni.getStorageSync).mockImplementation((key: string) => storage.get(key) ?? '')
    vi.mocked(uni.setStorageSync).mockImplementation((key: string, value: any) => {
      storage.set(key, value)
    })
    vi.mocked(uni.removeStorageSync).mockImplementation((key: string) => {
      storage.delete(key)
    })
  })

  it('同一表单多次取键返回同一个 UUID', () => {
    const first = submitRequestId('rescue')
    const retry = submitRequestId('rescue')

    expect(retry).toBe(first)
    expect(first).toMatch(UUID_RE)
  })

  it('救援与咨询使用不同的键', () => {
    const rescue = submitRequestId('rescue')
    const consult = submitRequestId('consult')

    expect(consult).not.toBe(rescue)
  })

  it('提交成功后清除，再次提交生成新键', () => {
    const first = submitRequestId('consult')
    clearSubmitRequestId('consult')

    expect(storage.has('tire_submit_request_id_consult')).toBe(false)
    expect(submitRequestId('consult')).not.toBe(first)
  })
})
