import { describe, expect, it } from 'vitest'
import { diffRecordStatus, RECORD_KIND_NAMES } from './records'
import type { ConsultRecord, RescueRecord } from './records'

function rescue(id: number, status: string): RescueRecord {
  return {
    id,
    vehicleType: 'big_truck',
    vehicleTypeName: '大车',
    plateNo: '苏A12345',
    lat: 31.2,
    lng: 118.4,
    locationDesc: '高速服务区',
    status,
    statusName: status,
    assignedStore: null,
    createdAt: '2026-10-01 10:00:00',
    updatedAt: '2026-10-01 10:00:00',
  }
}

function consult(id: number, status: string): ConsultRecord {
  return {
    id,
    plateNo: '苏A12345',
    carModel: '解放 J6',
    lat: null,
    lng: null,
    locationDesc: '',
    description: '右侧轮胎瘪了',
    images: [],
    status,
    statusName: status,
    createdAt: '2026-10-01 10:00:00',
    updatedAt: '2026-10-01 10:00:00',
  }
}

describe('记录状态对比 diffRecordStatus', () => {
  it('基线为空（首拉）不产生任何变化通知', () => {
    const next = { rescues: [rescue(1, 'pending')], consults: [consult(2, 'pending')] }
    expect(diffRecordStatus(null, next)).toEqual([])
  })

  it('状态流转被识别：pending → contacting 返回 from/to', () => {
    const prev = { rescues: [rescue(1, 'pending')], consults: [] }
    const next = { rescues: [rescue(1, 'contacting')], consults: [] }
    const changes = diffRecordStatus(prev, next)
    expect(changes).toEqual([{ kind: 'rescue', id: 1, from: 'pending', to: 'contacting', statusName: 'contacting' }])
  })

  it('新出现的记录（司机刚提交）不视为变化，静默并入基线', () => {
    const prev = { rescues: [rescue(1, 'pending')], consults: [] }
    const next = { rescues: [rescue(2, 'pending'), rescue(1, 'pending')], consults: [] }
    expect(diffRecordStatus(prev, next)).toEqual([])
  })

  it('从列表消失的记录（分页外）不视为变化', () => {
    const prev = { rescues: [rescue(1, 'pending'), rescue(2, 'pending')], consults: [] }
    const next = { rescues: [rescue(1, 'resolved')], consults: [] }
    const changes = diffRecordStatus(prev, next)
    expect(changes).toEqual([{ kind: 'rescue', id: 1, from: 'pending', to: 'resolved', statusName: 'resolved' }])
  })

  it('咨询与救援两类记录同时变化都返回', () => {
    const prev = { rescues: [rescue(1, 'pending')], consults: [consult(3, 'pending')] }
    const next = { rescues: [rescue(1, 'contacting')], consults: [consult(3, 'resolved')] }
    const changes = diffRecordStatus(prev, next)
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ kind: 'rescue', id: 1 })
    expect(changes[1]).toMatchObject({ kind: 'consult', id: 3 })
  })

  it('状态没变的记录不产生变化条目', () => {
    const prev = { rescues: [rescue(1, 'contacting')], consults: [consult(3, 'resolved')] }
    const next = { rescues: [rescue(1, 'contacting')], consults: [consult(3, 'resolved')] }
    expect(diffRecordStatus(prev, next)).toEqual([])
  })
})

describe('记录类型显示名', () => {
  it('与 GLOSSARY 口径一致：救援工单 / 救援咨询', () => {
    expect(RECORD_KIND_NAMES.rescue).toBe('救援工单')
    expect(RECORD_KIND_NAMES.consult).toBe('救援咨询')
  })
})
