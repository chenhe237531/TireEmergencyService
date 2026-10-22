/**
 * 初始化数据：
 * - 必装内容：管理员、平台设置、FAQ（生产环境同样需要）
 * - 演示内容：10 家门店、演示司机、工单、浏览痕迹（仅 SEED_DEMO=1 或非生产环境）
 *
 * 生产环境默认不写入演示门店/工单，也不会使用 admin123 默认密码：
 *   未设置 INITIAL_ADMIN_PASSWORD 时随机生成，并在启动日志中打印一次。
 *   SEED_DEMO=1 可显式开启演示数据；本地开发默认开启。
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPwd } from '../src/common/util'

const prisma = new PrismaClient()

const isProd = process.env.NODE_ENV === 'production'
const seedDemo = process.env.SEED_DEMO === '1' || (process.env.SEED_DEMO !== '0' && !isProd)

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
  privacyPolicy: '我们非常重视您的个人信息保护。\n\n一、我们收集的信息\n1. 账号与联系信息：手机号，用于客服与您联系（后续如启用短信验证码登录，也用于身份校验）；微信登录时获取您的微信昵称、头像；\n2. 位置信息：经您授权后获取的当前位置，用于展示附近门店与地图选点；\n3. 车辆与故障信息：您主动填写的车型、车牌、故障描述与现场照片；\n4. 设备信息：设备型号、操作系统版本与网络状态，用于保障服务可用与安全。\n\n二、信息使用\n仅用于平台客服与您联系、为您对接救援门店及必要的平台运营统计。\n\n三、第三方 SDK 与权限\n1. 高德地图 SDK：提供定位与地图选点，收集位置信息与设备信息，仅在您同意本政策后初始化；\n2. DCloud 运行环境：uni-app 跨端运行时，收集设备基础信息用于页面正常渲染。\nApp 申请的定位、相机、相册、通知与安装权限仅用于对应功能；拒绝后不影响文字提交与其他功能。\n\n四、信息保护与权利\n门店联系方式与详细地址受平台保护，不会向您或第三方泄露；您可在「我的-个人资料」查看或修改信息，在「我的-我的记录」查看求助进度。',
  shareTitle: '小蚂蚁轮胎救援 · 24小时轮胎救援一键呼叫',
}

async function ensureStaff() {
  const username = (process.env.INITIAL_ADMIN_USERNAME || 'admin').trim() || 'admin'
  const existing = await prisma.staff.findUnique({ where: { username } })
  if (existing) {
    console.log(`[seed] 管理员 ${username} 已存在，保留原密码`)
    return
  }
  const generated = !process.env.INITIAL_ADMIN_PASSWORD
  const password = process.env.INITIAL_ADMIN_PASSWORD || (isProd ? randomBytes(9).toString('base64url') : 'admin123')
  await prisma.staff.create({
    data: { username, password: hashPwd(password), name: '超级管理员', role: 'super_admin' },
  })
  console.log(generated
    ? `[seed] 已创建管理员 ${username}，初始密码：${password}（仅打印一次，请登录后立即修改）`
    : `[seed] 已创建管理员 ${username}（使用 INITIAL_ADMIN_PASSWORD）`)

  // 运营账号：生产环境必须显式提供 INITIAL_OPS_PASSWORD；本地演示默认 ops123456
  const opsPassword = process.env.INITIAL_OPS_PASSWORD || (isProd ? '' : 'ops123456')
  if (opsPassword) {
    const ops = await prisma.staff.findUnique({ where: { username: 'ops' } })
    if (!ops) {
      await prisma.staff.create({
        data: { username: 'ops', password: hashPwd(opsPassword), name: '平台运营小刘', role: 'ops' },
      })
      console.log('[seed] 已创建运营账号 ops')
    }
  }
}

async function ensureContent() {
  // 设置只在缺失时补齐，避免每次冷启动覆盖运营修改
  for (const [key, value] of Object.entries(SETTINGS)) {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (!row) await prisma.setting.create({ data: { key, value } })
  }
  if (await prisma.faq.count() === 0) {
    await prisma.faq.createMany({ data: FAQS })
    console.log(`[seed] 已写入 ${FAQS.length} 条默认 FAQ`)
  }
}

async function seedDemoData() {
  if (!seedDemo) {
    console.log('[seed] SEED_DEMO 未开启，跳过演示门店/司机/工单')
    return
  }

  let stores = await prisma.store.findMany({ orderBy: { id: 'asc' } })
  if (!stores.length) {
    stores = await Promise.all(STORES.map(s => prisma.store.create({ data: s })))
    console.log(`[seed] 已写入 ${stores.length} 家演示门店`)
  }

  let driver = await prisma.driver.findUnique({ where: { openid: 'demo_seed_driver' } })
  if (!driver) {
    driver = await prisma.driver.create({
      data: { openid: 'demo_seed_driver', nickname: '豫A·老师傅', phone: '13937100001', role: 'private_owner', lastLoginAt: new Date() },
    })
  }

  const rescueCount = await prisma.rescueAlert.count({ where: { driverId: driver.id } })
  if (!rescueCount) {
    const pending = await prisma.rescueAlert.create({
      data: { driverId: driver.id, vehicleType: 'big_truck', plateNo: '豫A8K2F6', lat: 34.753, lng: 113.762, locationDesc: '商都路附近，右前轮爆胎', status: 'pending' },
    })
    const contacting = await prisma.rescueAlert.create({
      data: { driverId: driver.id, vehicleType: 'small_car', plateNo: '豫A12345', lat: 34.748, lng: 113.771, locationDesc: '东风路天明路交叉口，胎压不足', status: 'contacting', note: '已电话联系司机，正对接万通轮胎超市', handledBy: '平台运营小刘', handledAt: new Date() },
    })
    await prisma.ticketLog.create({
      data: { ticketType: 'rescue', ticketId: contacting.id, fromStatus: 'pending', toStatus: 'contacting', note: '已电话联系司机，正对接万通轮胎超市', operatorName: '平台运营小刘' },
    })
    await prisma.ticketLog.create({
      data: { ticketType: 'rescue', ticketId: pending.id, fromStatus: '', toStatus: 'pending', note: '司机提交求助', operatorName: '司机' },
    })
  }
  // 兼容旧版演示数据：补齐车型，后台推荐门店才有依据
  await prisma.rescueAlert.updateMany({ where: { driverId: driver.id, vehicleType: '' }, data: { vehicleType: 'other' } })

  const consultCount = await prisma.consultRequest.count({ where: { driverId: driver.id } })
  if (!consultCount) {
    await prisma.consultRequest.create({
      data: {
        driverId: driver.id, plateNo: '豫A8K2F6', carModel: '解放 J6 重卡', lat: 34.761, lng: 113.733,
        locationDesc: '北三环高架桥下', description: '左后轮扎钉子漏气，需要流动补胎，车上满载不能久停。',
        images: [], contactName: '刘师傅', contactPhone: '13937100001', status: 'pending',
      },
    })
  }

  if (stores.length && await prisma.viewLog.count({ where: { driverId: driver.id } }) === 0) {
    await prisma.viewLog.createMany({
      data: [
        { driverId: driver.id, storeId: stores[0].id, action: 'view' },
        { driverId: driver.id, storeId: stores[0].id, action: 'click' },
        { driverId: driver.id, storeId: stores[Math.min(5, stores.length - 1)].id, action: 'view' },
      ],
    })
  }
}

async function main() {
  console.log(`[seed] 开始初始化数据（${isProd ? 'production' : 'development'}，SEED_DEMO=${seedDemo ? '1' : '0'}）`)
  await ensureStaff()
  await ensureContent()
  await seedDemoData()
  const [staff, stores, drivers, faqs] = await Promise.all([
    prisma.staff.count(), prisma.store.count(), prisma.driver.count(), prisma.faq.count(),
  ])
  console.log(`[seed] 完成：员工 ${staff} · 门店 ${stores} · 司机 ${drivers} · FAQ ${faqs}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
