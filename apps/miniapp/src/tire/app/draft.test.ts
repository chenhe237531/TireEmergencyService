import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitRequestId } from '../utils'
import { clearConsultDraft, clearRescueDraft, CONSULT_DRAFT_KEY, isEmptyConsultDraft, isEmptyRescueDraft, loadConsultDraft, loadRescueDraft, RESCUE_DRAFT_KEY, saveConsultDraft, saveRescueDraft } from './draft'

describe('救援表单草稿', () => {
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

  it('保存后可恢复全部字段', () => {
    saveRescueDraft({ vehicleType: 'big_truck', plateNo: '豫A8K2F6', locationDesc: '京港澳高速 K680 应急车道' })

    expect(loadRescueDraft()).toEqual({
      vehicleType: 'big_truck',
      plateNo: '豫A8K2F6',
      locationDesc: '京港澳高速 K680 应急车道',
    })
  })

  it('没有草稿时读取返回 null', () => {
    expect(loadRescueDraft()).toBeNull()
  })

  it('内容清空后保存：草稿被删除（用户主动清空）', () => {
    saveRescueDraft({ vehicleType: 'small_car', plateNo: '豫A8K2F6', locationDesc: '郑州东站' })
    // 用户把车牌与描述都清掉，只剩带默认值的车型
    saveRescueDraft({ vehicleType: 'small_car', plateNo: '', locationDesc: '' })

    expect(storage.has(RESCUE_DRAFT_KEY)).toBe(false)
    expect(loadRescueDraft()).toBeNull()
  })

  it('提交成功后清理：草稿与幂等键一并删除，下次提交用新键', () => {
    saveRescueDraft({ vehicleType: 'small_car', plateNo: '', locationDesc: '郑州东站' })
    const key = submitRequestId('rescue')
    expect(storage.get('tire_submit_request_id_rescue')).toBe(key)

    clearRescueDraft()

    expect(storage.has(RESCUE_DRAFT_KEY)).toBe(false)
    expect(storage.has('tire_submit_request_id_rescue')).toBe(false)
    expect(submitRequestId('rescue')).not.toBe(key)
  })

  it('草稿在则幂等键在：重试与杀进程后都复用同一个键', () => {
    saveRescueDraft({ vehicleType: 'big_truck', plateNo: '', locationDesc: '服务区' })
    const first = submitRequestId('rescue')

    // 模拟杀进程后重进：重新读到的仍是同一份草稿与同一个键
    expect(loadRescueDraft()?.locationDesc).toBe('服务区')
    expect(submitRequestId('rescue')).toBe(first)
  })

  it('登录态失效不影响草稿：只清 token 时草稿仍在', () => {
    saveRescueDraft({ vehicleType: 'small_car', plateNo: '豫A8K2F6', locationDesc: '郑州东站' })
    // request.ts 收到 40001 只清 tire_token，不碰草稿
    storage.delete('tire_token')

    expect(loadRescueDraft()?.plateNo).toBe('豫A8K2F6')
  })

  it('存储内容损坏时按无草稿处理，不抛错', () => {
    storage.set(RESCUE_DRAFT_KEY, 'not-an-object')

    expect(loadRescueDraft()).toBeNull()
  })

  it('isEmptyRescueDraft：描述或车牌任一非空就不算空草稿', () => {
    expect(isEmptyRescueDraft(null)).toBe(true)
    expect(isEmptyRescueDraft({ vehicleType: 'small_car', plateNo: '', locationDesc: '' })).toBe(true)
    expect(isEmptyRescueDraft({ vehicleType: 'small_car', plateNo: '豫A8K2F6', locationDesc: '' })).toBe(false)
    expect(isEmptyRescueDraft({ vehicleType: '', plateNo: '', locationDesc: '郑州东站' })).toBe(false)
  })
})

describe('咨询表单草稿', () => {
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

  const fullDraft = () => ({
    plateNo: '豫A8K2F6',
    carModel: '解放J6',
    locationDesc: '京港澳高速 K680 应急车道',
    description: '右前轮爆胎',
    contactName: '王师傅',
    contactPhone: '13800138000',
  })

  it('保存后可恢复全部字段', () => {
    saveConsultDraft(fullDraft())

    expect(loadConsultDraft()).toEqual(fullDraft())
  })

  it('没有草稿时读取返回 null', () => {
    expect(loadConsultDraft()).toBeNull()
  })

  it('内容清空后保存：草稿被删除（用户主动清空）', () => {
    saveConsultDraft(fullDraft())
    saveConsultDraft({ plateNo: '', carModel: '', locationDesc: '', description: '', contactName: '', contactPhone: '' })

    expect(storage.has(CONSULT_DRAFT_KEY)).toBe(false)
    expect(loadConsultDraft()).toBeNull()
  })

  it('只填部分字段也算有效草稿（照片失败重试期间至少保留已填内容）', () => {
    saveConsultDraft({ plateNo: '', carModel: '', locationDesc: '', description: '右前轮漏气', contactName: '王师傅', contactPhone: '13800138000' })

    expect(loadConsultDraft()?.description).toBe('右前轮漏气')
  })

  it('提交成功后清理：草稿与幂等键一并删除，下次提交用新键', () => {
    saveConsultDraft(fullDraft())
    const key = submitRequestId('consult')
    expect(storage.get('tire_submit_request_id_consult')).toBe(key)

    clearConsultDraft()

    expect(storage.has(CONSULT_DRAFT_KEY)).toBe(false)
    expect(storage.has('tire_submit_request_id_consult')).toBe(false)
    expect(submitRequestId('consult')).not.toBe(key)
  })

  it('草稿在则幂等键在：弱网重试与杀进程后都复用同一个键', () => {
    saveConsultDraft(fullDraft())
    const first = submitRequestId('consult')

    expect(loadConsultDraft()?.description).toBe('右前轮爆胎')
    expect(submitRequestId('consult')).toBe(first)
  })

  it('咨询与救援草稿互不影响：各自独立存储', () => {
    saveConsultDraft(fullDraft())
    saveRescueDraft({ vehicleType: 'big_truck', plateNo: '豫B12345', locationDesc: '服务区' })

    expect(loadConsultDraft()?.plateNo).toBe('豫A8K2F6')
    expect(loadRescueDraft()?.plateNo).toBe('豫B12345')

    clearConsultDraft()
    expect(loadRescueDraft()?.plateNo).toBe('豫B12345')
    expect(storage.has(RESCUE_DRAFT_KEY)).toBe(true)
  })

  it('存储内容损坏时按无草稿处理，不抛错', () => {
    storage.set(CONSULT_DRAFT_KEY, 'not-an-object')

    expect(loadConsultDraft()).toBeNull()
  })

  it('isEmptyConsultDraft：任一文字字段非空就不算空草稿', () => {
    expect(isEmptyConsultDraft(null)).toBe(true)
    expect(isEmptyConsultDraft({ plateNo: '', carModel: '', locationDesc: '', description: '', contactName: '', contactPhone: '' })).toBe(true)
    expect(isEmptyConsultDraft({ ...fullDraft(), plateNo: '', description: '' })).toBe(false)
  })
})
