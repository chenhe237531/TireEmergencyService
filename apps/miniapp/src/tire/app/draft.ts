/**
 * 表单草稿（救援 / 咨询）：每次变更写入本地存储（uni.setStorageSync 在 App / 小程序 / H5 通用），
 * 打开表单时恢复；提交成功或用户清空内容后删除。
 * 幂等键（clientRequestId）与草稿同生命周期：删除草稿时一并清除，
 * 「一次填写意图」从头到尾只用一个键（键的生成与复用见 utils.ts 的 submitRequestId）。
 */
import { clearSubmitRequestId } from '../utils'

export const RESCUE_DRAFT_KEY = 'tire_draft_rescue'

/** 救援表单草稿内容：只存用户填写的字段；坐标由定位实时获取，不进草稿 */
export interface RescueDraft {
  vehicleType: string
  plateNo: string
  locationDesc: string
}

/**
 * 草稿是否为空：车型有默认值不算内容，位置描述与车牌都清空视为用户主动清空草稿。
 * 空草稿不落盘，保存时直接删除。
 */
export function isEmptyRescueDraft(draft: RescueDraft | null | undefined): boolean {
  return !draft || (!draft.locationDesc.trim() && !draft.plateNo.trim())
}

/** 保存草稿：内容为空时改为删除（用户主动清空），不留无意义的空草稿 */
export function saveRescueDraft(draft: RescueDraft) {
  if (isEmptyRescueDraft(draft)) {
    clearRescueDraft()
    return
  }
  uni.setStorageSync(RESCUE_DRAFT_KEY, draft)
}

/** 读取草稿：没有或内容已空返回 null；存储损坏时不抛错，按无草稿处理 */
export function loadRescueDraft(): RescueDraft | null {
  try {
    const raw = uni.getStorageSync(RESCUE_DRAFT_KEY)
    if (!raw || typeof raw !== 'object')
      return null
    const d = raw as Partial<RescueDraft>
    const draft: RescueDraft = {
      vehicleType: typeof d.vehicleType === 'string' ? d.vehicleType : '',
      plateNo: typeof d.plateNo === 'string' ? d.plateNo : '',
      locationDesc: typeof d.locationDesc === 'string' ? d.locationDesc : '',
    }
    return isEmptyRescueDraft(draft) ? null : draft
  }
  catch {
    return null
  }
}

/** 删除草稿：连同幂等键一起清，下一次提交是全新的一次填写意图 */
export function clearRescueDraft() {
  uni.removeStorageSync(RESCUE_DRAFT_KEY)
  clearSubmitRequestId('rescue')
}

export const CONSULT_DRAFT_KEY = 'tire_draft_consult'

/** 咨询表单草稿内容：只存用户填写的文字字段；照片走待上传队列（photoQueue.ts），坐标由定位实时获取 */
export interface ConsultDraft {
  plateNo: string
  carModel: string
  locationDesc: string
  description: string
  contactName: string
  contactPhone: string
}

/**
 * 咨询草稿是否为空：全部文字字段清空视为用户主动清空草稿，空草稿不落盘。
 * 联系方式也参与判断：只填联系方式的草稿没有保存价值，提交时必填校验会兜底。
 */
export function isEmptyConsultDraft(draft: ConsultDraft | null | undefined): boolean {
  return !draft || (
    !draft.plateNo.trim()
    && !draft.carModel.trim()
    && !draft.locationDesc.trim()
    && !draft.description.trim()
    && !draft.contactName.trim()
    && !draft.contactPhone.trim()
  )
}

/** 保存咨询草稿：内容为空时改为删除（用户主动清空），不留无意义的空草稿 */
export function saveConsultDraft(draft: ConsultDraft) {
  if (isEmptyConsultDraft(draft)) {
    clearConsultDraft()
    return
  }
  uni.setStorageSync(CONSULT_DRAFT_KEY, draft)
}

/** 读取咨询草稿：没有或内容已空返回 null；存储损坏时不抛错，按无草稿处理 */
export function loadConsultDraft(): ConsultDraft | null {
  try {
    const raw = uni.getStorageSync(CONSULT_DRAFT_KEY)
    if (!raw || typeof raw !== 'object')
      return null
    const d = raw as Partial<ConsultDraft>
    const draft: ConsultDraft = {
      plateNo: typeof d.plateNo === 'string' ? d.plateNo : '',
      carModel: typeof d.carModel === 'string' ? d.carModel : '',
      locationDesc: typeof d.locationDesc === 'string' ? d.locationDesc : '',
      description: typeof d.description === 'string' ? d.description : '',
      contactName: typeof d.contactName === 'string' ? d.contactName : '',
      contactPhone: typeof d.contactPhone === 'string' ? d.contactPhone : '',
    }
    return isEmptyConsultDraft(draft) ? null : draft
  }
  catch {
    return null
  }
}

/** 删除咨询草稿：连同幂等键一起清，下一次提交是全新的一次填写意图 */
export function clearConsultDraft() {
  uni.removeStorageSync(CONSULT_DRAFT_KEY)
  clearSubmitRequestId('consult')
}
