/**
 * 演示数据种子：管理员、示例门店（郑州周边，覆盖 6 个分类）、FAQ、平台设置、演示工单。
 * 运行：node prisma/db.js seed（db:reset 会清库后自动执行）
 */
import { PrismaClient } from '@prisma/client'
import { hashPwd } from '../src/common/util'

const prisma = new PrismaClient()

/** 示例门店：坐标以郑州东区（约 34.75, 113.75）为中心散布，方便按距离排序演示 */
const STORES = [
  { name: '顺达大车轮胎广场', category: 'tire_big', mainServices: '大车补胎、换胎、24小时流动补胎', score: 4.8, lat: 34.7612, lng: 113.7560, address: '郑州市郑东新区商都路与明理路交叉口东 200 米路南', phone: '13803710001', contactName: '王经理', areaLabel: '郑东新区', sort: 100 },
  { name: '驰远小车轮胎专营店', category: 'tire_small', mainServices: '轿车补胎、换胎、动平衡、四轮定位', score: 4.6, lat: 34.7480, lng: 113.7690, address: '郑州市金水区东风路与天明路交叉口北 100 米', phone: '13803710002', contactName: '李店长', areaLabel: '金水区', sort: 90 },
  { name: '万通轮胎超市（大小车）', category: 'tire_both', mainServices: '大小车轮胎销售、补胎、上门换胎', score: 4.9, lat: 34.7300, lng: 113.7410, address: '郑州市二七区大学南路与南三环交叉口南', phone: '13803710003', contactName: '赵经理', areaLabel: '二七区', sort: 95 },
  { name: '重卡之家大车修理厂', category: 'repair_big', mainServices: '货车维修、电路、刹车、轮胎一体服务', score: 4.5, lat: 34.7820, lng: 113.7220, address: '郑州市惠济区江山路与开元路交叉口西', phone: '13803710004', contactName: '孙师傅', areaLabel: '惠济区', sort: 80 },
  { name: '捷安小车快修中心', category: 'repair_small', mainServices: '快修保养、补胎换胎、应急救援', score: 4.4, lat: 34.7550, lng: 113.7810, address: '郑州市郑东新区农业东路与众意西路交叉口', phone: '13803710005', contactName: '周店长', areaLabel: '郑东新区', sort: 75 },
  { name: '中原道路救援拖车队', category: 'towing', mainServices: '24小时拖车、困境救援、高速救援', score: 4.7, lat: 34.7400, lng: 113.7050, address: '郑州市中原区西三环与建设路交叉口北', phone: '13803710006', contactName: '吴队长', areaLabel: '中原区', sort: 85 },
  { name: '宏达大车轮胎服务部', category: 'tire_big', mainServices: '大车补胎、轮胎修补、氮气加注', score: 4.3, lat: 34.7240, lng: 113.7770, address: '郑州市管城区紫荆山路与航海路交叉口南', phone: '13803710007', contactName: '郑师傅', areaLabel: '管城区', sort: 70 },
  { name: '安心小车轮胎店', category: 'tire_small', mainServices: '补胎、换胎、胎压检测', score: 4.5, lat: 34.7690, lng: 113.7380, address: '郑州市金水区南阳路与黄河路交叉口', phone: '13803710008', contactName: '钱店长', areaLabel: '金水区', sort: 65 },
  { name: '豫工汽修厂（大小车）', category: 'repair_big', mainServices: '大小车维修、钣金、电路检修', score: 4.2, lat: 34.7160, lng: 113.7250, address: '郑州市二七区嵩山南路与南四环交叉口', phone: '13803710009', contactName: '冯厂长', areaLabel: '二七区', sort: 60 },
  { name: '闪电道路救援', category: 'towing', mainServices: '拖车、搭电、换胎、送油', score: 4.6, lat: 34.7900, lng: 113.7620, address: '郑州市金水区中州大道与国基路交叉口', phone: '13803710010', contactName: '何队长', areaLabel: '金水区', sort: 55 },
]

const FAQS = [
  { question: '平台的服务流程是怎样的？', answer: '您在小程序提交服务需求（或点击「故障找救援」）后，平台客服会第一时间与您电话联系，确认故障情况并沟通附近合作门店，协商完成后由门店线下为您提供维修服务。', sort: 100 },
  { question: '服务如何付费？', answer: '小蚂蚁平台不参与线上交易。服务费用由您与门店现场协商确认、线下支付，平台保证价格公开透明、服务标准可靠。', sort: 90 },
  { question: '如果对服务不满意可以退款吗？', answer: '服务款项为线下与门店结算。如遇服务质量问题，可拨打平台客服电话投诉，平台将介入协调，保障您的合法权益。', sort: 80 },
  { question: '为什么看不到门店的电话和详细地址？', answer: '为保障合作商家信息与您的消费权益，平台统一由客服为您对接门店，避免信息泄露与随意报价，确保服务标准化、可信赖。', sort: 70 },
  { question: '夜间或高速上发生故障怎么办？', answer: '小程序点击「故障找救援」，选择您的大致位置并提交，平台 24 小时值守客服会立即收到通知并尽快与您联系，为您安排就近救援。', sort: 60 },
]

const SETTINGS: Record<string, string> = {
  servicePhone: '400-100-8666',
  wechatQr: '',
  about: '小蚂蚁轮胎救援是连接司机与专业轮胎服务商的救援服务平台。无论您在城市道路还是高速途中遭遇爆胎、亏气等轮胎故障，平台都将第一时间为您对接附近正规轮胎门店与救援力量，提供标准化、可信赖的补胎换胎与拖车救援服务。小蚂蚁，随叫随到，使命必达。',
  userAgreement: '一、服务说明\n小蚂蚁轮胎救援平台为司机用户与轮胎服务商提供信息对接服务。平台根据您提交的需求，由客服人工为您沟通协调附近门店，具体维修服务及费用由门店线下提供与收取。\n\n二、用户义务\n1. 您应提供真实有效的联系方式与车辆信息；\n2. 线下服务时请与门店确认服务内容与价格；\n3. 不得利用平台从事违法违规活动。\n\n三、免责声明\n平台不对门店线下服务的施工质量、价格争议承担直接责任，但会协助您协调处理。继续使用即表示您已阅读并同意本协议。',
  privacyPolicy: '我们非常重视您的个人信息保护。\n\n1. 信息收集：登录时获取您的微信昵称、头像，以及您主动填写的手机号、位置、车辆与故障信息；\n2. 信息使用：仅用于平台客服与您联系、为您对接救援门店；\n3. 信息保护：门店的联系方式与详细地址受平台保护，同样不会向第三方泄露您的信息；\n4. 您可随时在小程序「我的-个人资料」中查看或修改您的个人信息。',
  shareTitle: '小蚂蚁轮胎救援 · 24小时轮胎救援一键呼叫',
}

async function main() {
  console.log('[seed] 开始写入演示数据 …')

  // 后台员工（密码 sha256 哈希）
  await prisma.staff.createMany({
    data: [
      { username: 'admin', password: hashPwd('admin123'), name: '超级管理员', role: 'super_admin' },
      { username: 'ops', password: hashPwd('ops123456'), name: '平台运营小刘', role: 'ops' },
    ],
  })

  // 门店
  const stores = await Promise.all(STORES.map(s => prisma.store.create({ data: s })))

  // 演示司机 + 工单 + 痕迹，让工作台一打开就有数据
  const driver = await prisma.driver.create({
    data: { openid: 'demo_seed_driver', nickname: '豫A·老师傅', phone: '13937100001', role: 'private_owner', lastLoginAt: new Date() },
  })
  await prisma.rescueAlert.create({
    data: { driverId: driver.id, lat: 34.753, lng: 113.762, locationDesc: '商都路附近，右前轮爆胎', status: 'pending' },
  })
  await prisma.rescueAlert.create({
    data: { driverId: driver.id, lat: 34.748, lng: 113.771, locationDesc: '东风路天明路交叉口，胎压不足', status: 'contacting', note: '已电话联系司机，正对接万通轮胎超市', handledBy: '平台运营小刘', handledAt: new Date() },
  })
  await prisma.consultRequest.create({
    data: {
      driverId: driver.id, plateNo: '豫A8K2F6', carModel: '解放 J6 重卡', lat: 34.761, lng: 113.733,
      locationDesc: '北三环高架桥下', description: '左后轮扎钉子漏气，需要流动补胎，车上满载不能久停。',
      images: [], contactName: '刘师傅', contactPhone: '13937100001', status: 'pending',
    },
  })
  await prisma.viewLog.createMany({
    data: [
      { driverId: driver.id, storeId: stores[0].id, action: 'view' },
      { driverId: driver.id, storeId: stores[0].id, action: 'click' },
      { driverId: driver.id, storeId: stores[5].id, action: 'view' },
    ],
  })

  // FAQ 与平台设置
  await prisma.faq.createMany({ data: FAQS })
  for (const [key, value] of Object.entries(SETTINGS))
    await prisma.setting.create({ data: { key, value } })

  console.log(`[seed] 完成：员工 2 · 门店 ${stores.length} · 司机 1 · 工单 3 · FAQ ${FAQS.length} · 设置 ${Object.keys(SETTINGS).length} 项`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
