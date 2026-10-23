/**
 * 救援表单草稿：每次变更写入本地存储（uni.setStorageSync 在 App / 小程序 / H5 通用），
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
