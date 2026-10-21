/** 工作台「最新待处理」列表的行视图模型：救援/咨询归一成同一结构，便于共用列表组件 */
export interface PendingRow {
  id: number;
  /** 业务编号（补零后的工单 id） */
  no: string;
  /** 主信息：救援=司机昵称，咨询=车牌号 */
  primary: string;
  /** 次信息：救援=手机号，咨询=联系人 + 电话 */
  secondary: string;
  /** 描述：救援=位置描述，咨询=故障描述 */
  desc: string;
  /** 提交时间 YYYY-MM-DD HH:mm */
  time: string;
}

/** 统计卡色调：brand 品牌色、danger/warning 警示色、neutral 中性色 */
export type StatTone = "brand" | "danger" | "warning" | "neutral";
