/** 工单状态机与展示字典：后台 / 司机端共用，避免两端文案与流转规则漂移 */

export const TICKET_STATUS_NAMES: Record<string, string> = {
  pending: '待处理',
  contacting: '跟进中',
  resolved: '已解决',
  cancelled: '已取消',
}

/** 状态机：pending → contacting → resolved / cancelled */
export const TICKET_FLOW: Record<string, string[]> = {
  pending: ['contacting', 'resolved', 'cancelled'],
  contacting: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
}

/** 救援车型：大车 / 小车 / 其他，后台据此推荐对应分类门店 */
export const RESCUE_VEHICLE_TYPES: Record<string, string> = {
  big_truck: '大车',
  small_car: '小车',
  other: '其他',
}

/** 车型对应可派单的门店分类 */
export const VEHICLE_STORE_CATEGORIES: Record<string, string[]> = {
  big_truck: ['tire_big', 'tire_both', 'repair_big', 'towing'],
  small_car: ['tire_small', 'tire_both', 'repair_small', 'towing'],
  other: ['tire_big', 'tire_small', 'tire_both', 'repair_big', 'repair_small', 'towing'],
}

/** 待处理超过该分钟数视为超时，后台列表高亮 */
export const TICKET_SLA_MINUTES = 10
