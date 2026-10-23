/** 跨页面共用的业务类型：位置坐标 / 页面参数 / 接口返回结构 */

/** 位置坐标：lat/lng 在救援、咨询与门店列表里总是结伴出现，统一成一个类型 */
export interface Coords {
  lat: number
  lng: number
}

/** 页面 onLoad 参数：uni 侧是弱类型对象，这里收紧为字符串字典 */
export type PageQuery = Record<string, string | undefined>

/** /app/settings 返回（字段缺省时按空串处理） */
export interface AppSettings {
  servicePhone: string
  wechatQr: string
  about: string
  userAgreement: string
  privacyPolicy: string
  shareTitle: string
  /** 演示环境允许手动输入手机号；false 时只能走微信手机号快速验证 */
  demoLogin?: boolean
}

/** /app/profile 返回的司机资料 */
export interface DriverProfile {
  id: number
  nickname: string
  avatarUrl: string
  phone: string
  /** private_owner | fleet | store；空 = 未完善身份 */
  role: string
}

/** open-type="getPhoneNumber" 按钮事件（真实微信环境 code 非空） */
export interface WxPhoneEvent {
  detail: { code?: string, errMsg?: string }
}
