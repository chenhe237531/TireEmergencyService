/**
 * 我的记录：类型定义、列表拉取与状态变化对比（issue #8）。
 *
 * 救援工单与救援咨询共用一套轮询与通知链路：
 * - fetchMyRecords 拉取两类记录（静默失败由调用方兜底）；
 * - diffRecordStatus 是纯函数，只对比「基线与新列表中都存在」的记录，
 *   司机自己刚提交的新记录（新 id）静默并入基线，不产生自我通知。
 */
import { http } from '@/tire/request'

/** 救援工单记录（GET /app/rescue-alerts 返回行） */
export interface RescueRecord {
  id: number
  vehicleType: string
  vehicleTypeName: string
  plateNo: string
  lat: number | null
  lng: number | null
  locationDesc: string
  status: string
  statusName: string
  assignedStore?: { id: number, name: string, categoryName: string, areaLabel: string } | null
  createdAt: string
  updatedAt: string
}

/** 救援咨询记录（GET /app/consults 返回行） */
export interface ConsultRecord {
  id: number
  plateNo: string
  carModel: string
  lat: number | null
  lng: number | null
  locationDesc: string
  description: string
  images: string[]
  status: string
  statusName: string
  createdAt: string
  updatedAt: string
}

/** 两类记录的一次完整快照 */
export interface RecordsSnapshot {
  rescues: RescueRecord[]
  consults: ConsultRecord[]
}

/** 记录类型：救援工单 | 救援咨询 */
export type RecordKind = 'rescue' | 'consult'

/** 一次轮询检测到的状态变化 */
export interface RecordStatusChange {
  kind: RecordKind
  id: number
  from: string
  to: string
  statusName: string
}

/** 记录类型显示名（通知文案用，与 GLOSSARY 口径一致） */
export const RECORD_KIND_NAMES: Record<RecordKind, string> = {
  rescue: '救援工单',
  consult: '救援咨询',
}

/** 同时拉取救援工单与咨询记录（最近 20 条），供轮询 / 记录页共用 */
export async function fetchMyRecords(): Promise<RecordsSnapshot> {
  const [r, c] = await Promise.all([
    http.get<{ list: RescueRecord[] }>('/app/rescue-alerts', { page: 1, pageSize: 20 }, { silent: true }),
    http.get<{ list: ConsultRecord[] }>('/app/consults', { page: 1, pageSize: 20 }, { silent: true }),
  ])
  return { rescues: r?.list || [], consults: c?.list || [] }
}

/**
 * 纯函数：对比基线与最新快照，返回发生状态变化的记录。
 * - 基线为空（首次拉取）返回 []：首拉只建立基线，不通知；
 * - 新出现的记录（司机刚提交的）不视为变化；
 * - 从列表消失的记录（分页外 / 注销清理）不视为变化。
 */
export function diffRecordStatus(prev: RecordsSnapshot | null, next: RecordsSnapshot): RecordStatusChange[] {
  if (!prev)
    return []
  const changes: RecordStatusChange[] = []
  const prevRescue = new Map(prev.rescues.map(r => [r.id, r.status]))
  const prevConsult = new Map(prev.consults.map(c => [c.id, c.status]))
  for (const r of next.rescues) {
    const from = prevRescue.get(r.id)
    if (from != null && from !== r.status)
      changes.push({ kind: 'rescue', id: r.id, from, to: r.status, statusName: r.statusName })
  }
  for (const c of next.consults) {
    const from = prevConsult.get(c.id)
    if (from != null && from !== c.status)
      changes.push({ kind: 'consult', id: c.id, from, to: c.status, statusName: c.statusName })
  }
  return changes
}
