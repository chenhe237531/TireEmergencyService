import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { FileInterceptor } from '@nestjs/platform-express/multer'
import { createHash } from 'node:crypto'
import { Aud, CurrentUser, DriverUser, OptionalAuth, signToken } from '../common/auth'
import { BizError, Err } from '../common/response'
import { RESCUE_VEHICLE_TYPES, TICKET_STATUS_NAMES } from '../common/ticket'
import { saveUploadFile } from '../common/upload'
import { distanceLabel, haversineKm, isValidPlateNo, pageArgs, pick } from '../common/util'
import { demoLoginAllowed, getWxPhoneNumber, wxConfigured } from '../common/wx'
import { PrismaService } from '../common/prisma.service'

/** 门店分类字典（与 schema.prisma Store.category 注释一致） */
export const STORE_CATEGORIES: Record<string, string> = {
  tire_big: '大车轮胎店',
  tire_small: '小车轮胎店',
  tire_both: '轮胎店',
  repair_big: '大车修理厂',
  repair_small: '小车修理厂',
  towing: '救援拖车',
}

/** 司机身份字典（Driver.role） */
export const DRIVER_ROLES: Record<string, string> = {
  private_owner: '私人车主',
  fleet: '车队',
  store: '服务门店',
}

const ACTIVE_RESCUE_STATUS = ['pending', 'contacting']
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

/** 微信 code2Session 返回结构（截取需要的字段） */
interface WxSession { openid: string, unionid?: string }

/**
 * 微信登录：配置了 WX_APPID / WX_SECRET 时走真实 code2Session；
 * 未配置时只有显式允许演示登录（本地开发或 ALLOW_DEMO_LOGIN=1）才按设备标识生成稳定 openid。
 */
async function codeToOpenid(code: string): Promise<WxSession> {
  if (wxConfigured()) {
    const appid = process.env.WX_APPID!
    const secret = process.env.WX_SECRET!
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const r: any = await fetch(url).then(res => res.json())
    if (r.errcode) throw new BizError(40020, `微信登录失败（${r.errcode} ${r.errmsg}）`)
    return { openid: r.openid, unionid: r.unionid }
  }
  if (!demoLoginAllowed()) throw new BizError(40020, '微信登录未配置，请联系平台管理员')
  // 演示模式：同一 code 得到同一 openid，客户端本地持久化 code 即可保持身份
  const hash = createHash('sha256').update(`demo:${code}`).digest('hex').slice(0, 24)
  return { openid: `demo_${hash}` }
}

@Controller('app')
export class AppAuthController {
  constructor(private prisma: PrismaService) {}

  /**
   * 小程序登录：code 换 openid，首次自动注册 Driver。
   * 返回的用户若 role 为空，端上需引导完善身份（私人车主/车队/服务门店）。
   */
  @Post('auth/login')
  async login(@Body() body: { code?: string, nickname?: string, avatarUrl?: string }) {
    if (!body.code) throw Err.bad('缺少微信登录 code')
    const session = await codeToOpenid(body.code)
    const driver = await this.prisma.driver.upsert({
      where: { openid: session.openid },
      create: { openid: session.openid, nickname: body.nickname || '微信用户', avatarUrl: body.avatarUrl || '' },
      update: { lastLoginAt: new Date(), nickname: body.nickname || undefined, avatarUrl: body.avatarUrl || undefined },
    })
    if (driver.status !== 'active') throw new BizError(40003, '账号已被封禁，请联系平台客服')
    return {
      accessToken: signToken({ id: driver.id }, 'app'),
      user: this.view(driver),
    }
  }

  /**
   * 绑定手机号：真实微信环境走 wxPhoneCode（getPhoneNumber 快速验证）；
   * 演示环境允许直接传手机号，便于 H5 / 本地联调。
   */
  @Post('auth/phone')
  @Aud('app')
  async bindPhone(@CurrentUser() u: DriverUser, @Body() body: { phone?: string, wxPhoneCode?: string }) {
    let phone = ''
    if (body.wxPhoneCode) {
      if (!wxConfigured()) throw new BizError(40020, '微信手机号验证未配置')
      phone = await getWxPhoneNumber(body.wxPhoneCode)
    }
    else if (demoLoginAllowed()) {
      if (!body.phone || !/^1\d{10}$/.test(body.phone)) throw Err.bad('请输入正确的手机号')
      phone = body.phone
    }
    else {
      throw new BizError(40020, '请使用微信手机号快捷验证')
    }
    const driver = await this.prisma.driver.update({ where: { id: u.id }, data: { phone } })
    return this.view(driver)
  }

  private view(d: { id: number, nickname: string, avatarUrl: string, phone: string, role: string }) {
    return { id: d.id, nickname: d.nickname, avatarUrl: d.avatarUrl, phone: d.phone, role: d.role, roleEmpty: !d.role }
  }
}

@Controller('app')
@Aud('app')
export class AppController {
  constructor(private prisma: PrismaService) {}

  /** 个人资料 */
  @Get('profile')
  async profile(@CurrentUser() u: DriverUser) {
    const d = await this.prisma.driver.findUnique({ where: { id: u.id } })
    if (!d || d.status !== 'active') throw Err.unauth()
    return { id: d.id, nickname: d.nickname, avatarUrl: d.avatarUrl, phone: d.phone, role: d.role, roleEmpty: !d.role, createdAt: d.createdAt }
  }

  /** 修改个人资料：昵称 / 头像 / 身份（身份字典校验） */
  @Patch('profile')
  async updateProfile(@CurrentUser() u: DriverUser, @Body() body: { nickname?: string, avatarUrl?: string, role?: string }) {
    if (body.role && !DRIVER_ROLES[body.role]) throw Err.bad('身份参数错误')
    const data = pick(body, ['nickname', 'avatarUrl', 'role'])
    const d = await this.prisma.driver.update({ where: { id: u.id }, data })
    return { id: d.id, nickname: d.nickname, avatarUrl: d.avatarUrl, phone: d.phone, role: d.role }
  }

  /**
   * 门店模糊列表：按距离由近到远。
   * 信息保护（需求文档）：不返回门店地址 / 电话 / 联系人，只给名称、距离、评分、主营、模糊区域。
   */
  @Get('stores')
  @OptionalAuth()
  async stores(
    @Query('category') category?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    if (category && !STORE_CATEGORIES[category]) throw Err.bad('分类参数错误')
    const rows = await this.prisma.store.findMany({
      where: { status: 'active', ...(category ? { category } : {}) },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
    })
    const hasPos = lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
    const list = rows.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      categoryName: STORE_CATEGORIES[s.category] || s.category,
      mainServices: s.mainServices,
      score: s.score,
      areaLabel: s.areaLabel,
      distanceKm: hasPos ? Math.round(haversineKm(Number(lat), Number(lng), s.lat, s.lng) * 100) / 100 : null,
    }))
    if (hasPos) list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    // 距离展示文案统一后端给，保证两端一致
    return list.map(it => ({ ...it, distanceLabel: distanceLabel(it.distanceKm) }))
  }

  /**
   * 浏览/点击埋点：后台据此判断司机意向，主动线下对接。
   * 支持单条 storeId 与批量 storeIds（列表曝光一次上报一页，避免 N 次请求）。
   */
  @Post('view-log')
  async viewLog(@CurrentUser() u: DriverUser, @Body() body: { storeId?: number, storeIds?: number[], action?: string }) {
    const raw = Array.isArray(body.storeIds) ? body.storeIds : body.storeId != null ? [body.storeId] : []
    const ids = Array.from(new Set(raw.map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, 50)
    if (!ids.length) throw Err.bad('门店参数错误')
    const stores = await this.prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true } })
    if (!stores.length) throw Err.notFound('门店不存在')
    const action = body.action === 'click' ? 'click' : 'view'
    await this.prisma.viewLog.createMany({ data: stores.map(s => ({ driverId: u.id, storeId: s.id, action })) })
    return { ok: true, count: stores.length }
  }

  /**
   * 故障找救援：一键触发，后台实时收到待处理通知。
   * 需要已绑定手机号（平台要电话联系司机），否则返回 40011 引导绑定。
   */
  @Post('rescue-alert')
  async rescueAlert(
    @CurrentUser() u: DriverUser,
    @Body() body: { vehicleType?: string, plateNo?: string, lat?: number, lng?: number, locationDesc?: string },
  ) {
    const d = await this.prisma.driver.findUnique({ where: { id: u.id } })
    if (!d) throw Err.unauth()
    if (!d.phone) throw Err.needPhone()

    const vehicleType = body.vehicleType || 'other'
    if (!RESCUE_VEHICLE_TYPES[vehicleType]) throw Err.bad('请选择车型')
    const plateNo = (body.plateNo || '').trim().slice(0, 20)
    if (!isValidPlateNo(plateNo)) throw Err.bad('车牌号格式不对，如 豫A8K2F6 / 豫AD12345（新能源）')
    const locationDesc = (body.locationDesc || '').trim().slice(0, 200)

    const lat = body.lat == null ? null : Number(body.lat)
    const lng = body.lng == null ? null : Number(body.lng)
    if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) throw Err.bad('纬度范围 -90 ~ 90')
    if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) throw Err.bad('经度范围 -180 ~ 180')
    // 至少要有位置描述或坐标，否则后台只拿到一个手机号，无法派单
    if (!locationDesc && (lat == null || lng == null)) throw Err.bad('请补充当前位置描述')

    // 防止连点 / 重复提交：同一司机 2 分钟内已有进行中的求助时不再新建
    const recent = await this.prisma.rescueAlert.findFirst({
      where: {
        driverId: u.id,
        status: { in: ACTIVE_RESCUE_STATUS },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    })
    if (recent) throw new BizError(40900, '刚刚已提交过求助，请勿重复操作', { id: recent.id })

    const row = await this.prisma.rescueAlert.create({
      data: {
        driverId: u.id,
        vehicleType,
        plateNo,
        lat,
        lng,
        locationDesc,
      },
    })
    return { id: row.id, status: row.status, createdAt: row.createdAt }
  }

  /** 我的救援记录：只返回本人数据，不暴露内部备注 */
  @Get('rescue-alerts')
  async myRescueAlerts(@CurrentUser() u: DriverUser, @Query('page') _page?: string, @Query('pageSize') _pageSize?: string) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize }, 50)
    const where = { driverId: u.id }
    const [total, list] = await Promise.all([
      this.prisma.rescueAlert.count({ where }),
      this.prisma.rescueAlert.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { assignedStore: { select: { id: true, name: true, category: true, areaLabel: true } } },
      }),
    ])
    return {
      list: list.map(r => ({
        id: r.id,
        vehicleType: r.vehicleType,
        vehicleTypeName: RESCUE_VEHICLE_TYPES[r.vehicleType] || '其他',
        plateNo: r.plateNo,
        lat: r.lat,
        lng: r.lng,
        locationDesc: r.locationDesc,
        status: r.status,
        statusName: TICKET_STATUS_NAMES[r.status] || r.status,
        assignedStore: r.assignedStore ? {
          id: r.assignedStore.id,
          name: r.assignedStore.name,
          category: r.assignedStore.category,
          categoryName: STORE_CATEGORIES[r.assignedStore.category] || r.assignedStore.category,
          areaLabel: r.assignedStore.areaLabel,
        } : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    }
  }

  /** 司机取消求助：仅待处理 / 跟进中可取消，取消后后台可见操作流水 */
  @Patch('rescue-alerts/:id/cancel')
  async cancelRescue(@CurrentUser() u: DriverUser, @Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.rescueAlert.findFirst({ where: { id, driverId: u.id } })
    if (!row) throw Err.notFound('求助记录不存在')
    if (!ACTIVE_RESCUE_STATUS.includes(row.status)) throw Err.conflict('当前状态不能取消')
    const note = row.note ? `${row.note}；司机取消` : '司机取消'
    const [updated] = await this.prisma.$transaction([
      this.prisma.rescueAlert.update({
        where: { id },
        data: { status: 'cancelled', note, handledBy: '司机', handledAt: new Date() },
      }),
      this.prisma.ticketLog.create({
        data: {
          ticketType: 'rescue',
          ticketId: id,
          fromStatus: row.status,
          toStatus: 'cancelled',
          note: '司机主动取消',
          operatorId: u.id,
          operatorName: '司机',
        },
      }),
    ])
    return { id: updated.id, status: updated.status, statusName: TICKET_STATUS_NAMES[updated.status] }
  }

  /** 我的咨询记录 */
  @Get('consults')
  async myConsults(@CurrentUser() u: DriverUser, @Query('page') _page?: string, @Query('pageSize') _pageSize?: string) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize }, 50)
    const where = { driverId: u.id }
    const [total, list] = await Promise.all([
      this.prisma.consultRequest.count({ where }),
      this.prisma.consultRequest.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
    ])
    return {
      list: list.map(r => ({
        id: r.id,
        plateNo: r.plateNo,
        carModel: r.carModel,
        lat: r.lat,
        lng: r.lng,
        locationDesc: r.locationDesc,
        description: r.description,
        images: r.images || [],
        status: r.status,
        statusName: TICKET_STATUS_NAMES[r.status] || r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    }
  }

  /** 服务咨询表单：游客可提交（自带联系方式），登录则关联司机 */
  @Post('consult')
  @OptionalAuth()
  async consult(
    @CurrentUser() u: DriverUser | undefined,
    @Body() body: {
      plateNo?: string, carModel?: string, lat?: number, lng?: number, locationDesc?: string,
      description?: string, images?: string[], contactName?: string, contactPhone?: string,
    },
  ) {
    if (!body.contactName?.trim()) throw Err.bad('请填写姓名')
    if (!/^1\d{10}$/.test(body.contactPhone || '')) throw Err.bad('请填写正确的联系电话')
    if (!body.description?.trim()) throw Err.bad('请描述故障情况')
    if (!isValidPlateNo((body.plateNo || '').trim().slice(0, 20))) throw Err.bad('车牌号格式不对，如 豫A8K2F6 / 豫AD12345（新能源）')
    const images = Array.isArray(body.images) ? body.images.filter(i => typeof i === 'string' && i.startsWith('/uploads/')).slice(0, 9) : []
    const row = await this.prisma.consultRequest.create({
      data: {
        driverId: u?.id ?? null,
        plateNo: (body.plateNo || '').trim().slice(0, 20),
        carModel: (body.carModel || '').trim().slice(0, 50),
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        locationDesc: (body.locationDesc || '').trim().slice(0, 200),
        description: body.description.trim().slice(0, 1000),
        images,
        contactName: body.contactName.trim().slice(0, 30),
        contactPhone: body.contactPhone!.trim(),
      },
    })
    return { id: row.id, status: row.status }
  }

  /** 平台设置：客服电话 / 二维码 / 关于我们 / 协议 / 分享文案；demoLogin 供端上决定手机号授权方式 */
  @Get('settings')
  @OptionalAuth()
  async settings() {
    const rows = await this.prisma.setting.findMany()
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
    return {
      servicePhone: map.servicePhone || '',
      wechatQr: map.wechatQr || '',
      about: map.about || '',
      userAgreement: map.userAgreement || '',
      privacyPolicy: map.privacyPolicy || '',
      shareTitle: map.shareTitle || '小蚂蚁轮胎救援',
      demoLogin: demoLoginAllowed(),
    }
  }

  /** 常见问题（支付 / 退款 / 服务流程） */
  @Get('faqs')
  @OptionalAuth()
  async faqs() {
    return this.prisma.faq.findMany({ where: { status: 'active' }, orderBy: [{ sort: 'desc' }, { id: 'asc' }], select: { id: true, question: true, answer: true } })
  }

  /** 图片上传（故障描述配图 / 客服二维码等），存数据库，返回 /uploads/<name>。游客也可上传咨询图。 */
  @Post('upload')
  @OptionalAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(@CurrentUser() u: DriverUser | undefined, @UploadedFile() file: Express.Multer.File) {
    return saveUploadFile(this.prisma, file, u?.id ? `driver#${u.id}` : 'anonymous')
  }
}
