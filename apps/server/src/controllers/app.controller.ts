import { Body, Controller, Delete, Get, Ip, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { FileInterceptor } from '@nestjs/platform-express/multer'
import { createHash } from 'node:crypto'
import { Aud, CurrentUser, DriverUser, OptionalAuth, signToken } from '../common/auth'
import { BizError, Err } from '../common/response'
import { RESCUE_VEHICLE_TYPES, TICKET_STATUS_NAMES } from '../common/ticket'
import { saveUploadFile } from '../common/upload'
import { distanceLabel, haversineKm, pick } from '../common/util'
import { demoLoginAllowed, getWxPhoneNumber, wxConfigured } from '../common/wx'
import { mergeDrivers } from '../common/driver-merge'
import { anonymizeDriver } from '../common/account-deletion'
import { SMS_CODE_TTL_MS, SMS_IP_HOURLY_LIMIT, SMS_MAX_ATTEMPTS, SMS_PHONE_DAILY_LIMIT, SMS_RESEND_INTERVAL_MS, demoCode, generateCode, hashCode, sendCode, verifyCode } from '../common/sms'
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

/**
 * 客户端幂等键：8~64 位字母数字/UUID。
 * 缺失或格式非法一律按旧客户端处理，继续走原有的 2 分钟窗口去重。
 */
function clientRequestId(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return /^[\w-]{8,64}$/.test(s) ? s : null
}

/** 幂等唯一索引冲突（并发提交时落败的一方改为读取原记录） */
function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/** 小程序列表分页：最多 50 条/页，避免一次拉全量 */
function pageArgs(q: { page?: string, pageSize?: string }) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 20))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}

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
   * 发送短信验证码：不泄露手机号是否注册。
   * 频控：同手机号 60 秒 1 条、每天 5 条；同 IP 每小时 10 条。
   * scene：login 登录 | delete 注销账号二次验证（ADR-0006）。
   */
  @Post('auth/sms/send')
  async sendSms(@Body() body: { phone?: string, scene?: string }, @Ip() ip: string) {
    const phone = String(body.phone || '').trim()
    const scene = body.scene === 'delete' ? 'delete' : 'login'
    if (!/^1[3-9]\d{9}$/.test(phone)) throw Err.bad('请输入正确的手机号')

    const now = new Date()
    const last = await this.prisma.smsCode.findFirst({
      where: { phone, scene },
      orderBy: { createdAt: 'desc' },
    })
    if (last && now.getTime() - last.createdAt.getTime() < SMS_RESEND_INTERVAL_MS)
      throw Err.tooMany('验证码发送太频繁，请 60 秒后再试')

    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const phoneCount = await this.prisma.smsCode.count({ where: { phone, scene, createdAt: { gte: dayStart } } })
    if (phoneCount >= SMS_PHONE_DAILY_LIMIT)
      throw Err.tooMany('该手机号今日验证码次数已达上限，请明天再试')

    const ipCount = await this.prisma.smsCode.count({
      where: { ip, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    })
    if (ipCount >= SMS_IP_HOURLY_LIMIT)
      throw Err.tooMany('请求过于频繁，请稍后再试')

    const code = generateCode()
    await this.prisma.smsCode.create({
      data: { phone, scene, codeHash: hashCode(phone, code), ip, expiresAt: new Date(now.getTime() + SMS_CODE_TTL_MS) },
    })
    await sendCode(phone, code)

    return { sent: true, scene, expiresIn: Math.floor(SMS_CODE_TTL_MS / 1000), ...(demoCode() ? { demoCode: code } : {}) }
  }

  /**
   * 校验并原子消费一条短信验证码：错误累加 attempts（5 次作废），成功置 consumedAt 禁止复用。
   * 登录与注销共用同一套校验规则。
   */
  private async consumeSmsCode(phone: string, code: string, scene: string) {
    const record = await this.prisma.smsCode.findFirst({
      where: { phone, scene, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!record || record.attempts >= SMS_MAX_ATTEMPTS) throw Err.smsCodeInvalid()
    if (!verifyCode(phone, code, record.codeHash)) {
      await this.prisma.smsCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
      throw Err.smsCodeInvalid()
    }
    // 原子消费：并发重复提交同一验证码时只有一次能成功
    const consumed = await this.prisma.smsCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (consumed.count === 0) throw Err.smsCodeInvalid()
  }

  /**
   * 手机号 + 验证码登录：新手机号自动创建司机账号，均不提示「未注册」。
   * 令牌受众 app，30 天有效；返回 isNew 供端上做首登引导。
   */
  @Post('auth/sms/login')
  async smsLogin(@Body() body: { phone?: string, code?: string }) {
    const phone = String(body.phone || '').trim()
    const code = String(body.code || '').trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) throw Err.bad('请输入正确的手机号')
    if (!/^\d{6}$/.test(code)) throw Err.bad('请输入 6 位验证码')

    await this.consumeSmsCode(phone, code, 'login')

    let driver = await this.prisma.driver.findFirst({ where: { phone } })
    const isNew = !driver
    if (driver) {
      if (driver.status !== 'active') throw new BizError(40003, '账号已被封禁，请联系平台客服')
      driver = await this.prisma.driver.update({ where: { id: driver.id }, data: { lastLoginAt: new Date() } })
    }
    else {
      driver = await this.prisma.driver.create({ data: { phone, nickname: '司机用户' } })
    }
    return {
      accessToken: signToken({ id: driver.id }, 'app'),
      user: this.view(driver),
      isNew,
    }
  }

  /**
   * 绑定手机号：真实微信环境走 wxPhoneCode（getPhoneNumber 快速验证）；
   * 演示环境允许直接传手机号，便于 H5 / 本地联调。
   * 手机号已属于另一司机时按 ADR-0002 合并：保留创建时间更早者为主账号，
   * 当前登录的司机若被合并走，返回换发的新令牌（端上必须替换，否则下次请求 40001）。
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

    const existing = await this.prisma.driver.findFirst({ where: { phone }, select: { id: true } })
    if (existing && existing.id !== u.id) {
      const { primaryId } = await mergeDrivers(this.prisma, { aId: u.id, bId: existing.id, phone, reason: 'wx-bind-merge' })
      const primary = await this.prisma.driver.findUniqueOrThrow({ where: { id: primaryId } })
      return {
        ...this.view(primary),
        merged: true,
        // 当前登录的司机被合并走时换发主账号令牌；主账号就是当前司机则令牌不变
        ...(primaryId !== u.id ? { accessToken: signToken({ id: primaryId }, 'app') } : {}),
      }
    }

    try {
      const driver = await this.prisma.driver.update({ where: { id: u.id }, data: { phone } })
      return this.view(driver)
    }
    catch (e: any) {
      // 并发绑定同一手机号撞唯一约束：提示重试，不暴露对方账号信息
      if (e?.code === 'P2002') throw Err.conflict('该手机号刚被其他账号绑定，请刷新后重试')
      throw e
    }
  }

  private view(d: { id: number, nickname: string, avatarUrl: string, phone: string | null, role: string }) {
    return { id: d.id, nickname: d.nickname, avatarUrl: d.avatarUrl, phone: d.phone, role: d.role, roleEmpty: !d.role }
  }

  /**
   * 注销账号（ADR-0006）：需先绑定手机号并用 scene=delete 的短信验证码二次验证
   * （登录验证码不可复用），验证通过后匿名化司机资料并清理关联数据。
   * 注销后同一手机号可重新注册，历史工单保留统计骨架但不关联新账号。
   */
  @Delete('account')
  @Aud('app')
  async deleteAccount(@CurrentUser() u: DriverUser, @Body() body: { code?: string }) {
    const code = String(body.code || '').trim()
    if (!/^\d{6}$/.test(code)) throw Err.bad('请输入 6 位验证码')
    const driver = await this.prisma.driver.findUnique({ where: { id: u.id } })
    if (!driver || driver.status !== 'active') throw Err.unauth()
    if (!driver.phone) throw Err.needPhone()
    // 二次验证用独立 scene，登录验证码不能用于注销
    await this.consumeSmsCode(driver.phone, code, 'delete')
    await anonymizeDriver(this.prisma, driver.id)
    return { deleted: true }
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
    @Body() body: { vehicleType?: string, plateNo?: string, lat?: number, lng?: number, locationDesc?: string, clientRequestId?: string },
  ) {
    const d = await this.prisma.driver.findUnique({ where: { id: u.id } })
    if (!d) throw Err.unauth()
    if (!d.phone) throw Err.needPhone()

    const vehicleType = body.vehicleType || 'other'
    if (!RESCUE_VEHICLE_TYPES[vehicleType]) throw Err.bad('请选择车型')
    const plateNo = (body.plateNo || '').trim().slice(0, 20)
    const locationDesc = (body.locationDesc || '').trim().slice(0, 200)

    const lat = body.lat == null ? null : Number(body.lat)
    const lng = body.lng == null ? null : Number(body.lng)
    if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) throw Err.bad('纬度范围 -90 ~ 90')
    if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) throw Err.bad('经度范围 -180 ~ 180')
    // 至少要有位置描述或坐标，否则后台只拿到一个手机号，无法派单
    if (!locationDesc && (lat == null || lng == null)) throw Err.bad('请补充当前位置描述')

    const requestId = clientRequestId(body.clientRequestId)
    if (requestId) {
      // 带幂等键：同司机同键直接返回原工单，不受 2 分钟窗口影响（弱网重试可能隔得更久）
      const existing = await this.prisma.rescueAlert.findFirst({
        where: { driverId: u.id, clientRequestId: requestId },
        select: { id: true, status: true, createdAt: true },
      })
      if (existing) return existing
    }
    else {
      // 旧客户端没有幂等键：保留同一司机 2 分钟内已有进行中求助时不新建的保护
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
    }

    try {
      const row = await this.prisma.rescueAlert.create({
        data: {
          driverId: u.id,
          vehicleType,
          plateNo,
          lat,
          lng,
          locationDesc,
          clientRequestId: requestId,
        },
      })
      return { id: row.id, status: row.status, createdAt: row.createdAt }
    }
    catch (e) {
      // 并发重试同时到达：唯一索引只放行一条，落败方读回原工单
      if (requestId && isDuplicateKey(e)) {
        const existing = await this.prisma.rescueAlert.findFirst({
          where: { driverId: u.id, clientRequestId: requestId },
          select: { id: true, status: true, createdAt: true },
        })
        if (existing) return existing
      }
      throw e
    }
  }

  /** 我的救援记录：只返回本人数据，不暴露内部备注 */
  @Get('rescue-alerts')
  async myRescueAlerts(@CurrentUser() u: DriverUser, @Query('page') _page?: string, @Query('pageSize') _pageSize?: string) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
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
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
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
      description?: string, images?: string[], contactName?: string, contactPhone?: string, clientRequestId?: string,
    },
  ) {
    if (!body.contactName?.trim()) throw Err.bad('请填写姓名')
    if (!/^1\d{10}$/.test(body.contactPhone || '')) throw Err.bad('请填写正确的联系电话')
    if (!body.description?.trim()) throw Err.bad('请描述故障情况')
    const images = Array.isArray(body.images) ? body.images.filter(i => typeof i === 'string' && i.startsWith('/uploads/')).slice(0, 9) : []
    const requestId = clientRequestId(body.clientRequestId)
    const driverId = u?.id ?? null
    // 游客没有司机标识，幂等键不生效（游客可多次替不同人咨询）
    if (driverId && requestId) {
      const existing = await this.prisma.consultRequest.findFirst({
        where: { driverId, clientRequestId: requestId },
        select: { id: true, status: true },
      })
      if (existing) return existing
    }
    try {
      const row = await this.prisma.consultRequest.create({
        data: {
          driverId,
          plateNo: (body.plateNo || '').trim().slice(0, 20),
          carModel: (body.carModel || '').trim().slice(0, 50),
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          locationDesc: (body.locationDesc || '').trim().slice(0, 200),
          description: body.description.trim().slice(0, 1000),
          images,
          contactName: body.contactName.trim().slice(0, 30),
          contactPhone: body.contactPhone!.trim(),
          clientRequestId: driverId ? requestId : null,
        },
      })
      return { id: row.id, status: row.status }
    }
    catch (e) {
      if (driverId && requestId && isDuplicateKey(e)) {
        const existing = await this.prisma.consultRequest.findFirst({
          where: { driverId, clientRequestId: requestId },
          select: { id: true, status: true },
        })
        if (existing) return existing
      }
      throw e
    }
  }

  /**
   * 咨询记录补传照片：文字提交不等待所有图片成功，失败照片由端上本地留存，
   * 后续重试上传成功后调用该接口合并到原记录（去重，与提交时一样最多 9 张）。
   */
  @Post('consults/:id/images')
  async consultImages(
    @CurrentUser() u: DriverUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { images?: string[] },
  ) {
    const row = await this.prisma.consultRequest.findFirst({ where: { id, driverId: u.id } })
    if (!row) throw Err.notFound('咨询记录不存在')
    const add = Array.isArray(body.images) ? body.images.filter(i => typeof i === 'string' && i.startsWith('/uploads/')) : []
    // images 为 Json 字段：先收敛成 string[] 再合并去重
    const current = Array.isArray(row.images) ? row.images.filter((i): i is string => typeof i === 'string') : []
    const images = [...new Set([...current, ...add])]
    if (images.length > 9) throw Err.bad('现场照片最多 9 张')
    await this.prisma.consultRequest.update({ where: { id }, data: { images } })
    return { id, images }
  }

  /**
   * 平台设置：客服电话 / 二维码 / 关于我们 / 协议 / 分享文案；demoLogin 供端上决定手机号授权方式。
   * 可选字段（icpNumber / userAgreementUrl / privacyPolicyUrl / h5Url）后台未配置时返回空串，端上按占位处理。
   */
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
      // App 备案号：关于页展示，发布前由运营填入
      icpNumber: map.icpNumber || '',
      // 协议外链：配置后「关于」页的《用户协议》《隐私政策》直接打开 URL，未配置沿用内置文本
      userAgreementUrl: map.userAgreementUrl || '',
      privacyPolicyUrl: map.privacyPolicyUrl || '',
      // H5 站点地址：安卓系统分享面板分享的落地链接
      h5Url: map.h5Url || '',
      demoLogin: demoLoginAllowed(),
      wxConfigured: wxConfigured(),
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

  /**
   * 图片上传（base64 JSON）：微信云托管 callContainer 不支持 multipart 直传，
   * 小程序切到 callContainer 模式后走这个通道（普通浏览器 / H5 仍走上面的 multipart）。
   */
  @Post('upload-base64')
  @OptionalAuth()
  async uploadBase64(@CurrentUser() u: DriverUser | undefined, @Body() body: { name?: string, dataBase64: string }) {
    const b64 = String(body?.dataBase64 || '').replace(/^data:image\/[\w.+-]+;base64,/, '')
    if (!b64) throw new BizError(40020, '请选择要上传的图片')
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) throw new BizError(40020, '图片数据不合法')
    const name = (body.name || 'photo.jpg').slice(0, 100)
    const extToMime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    const ext = (name.split('.').pop() || '').toLowerCase()
    const file = {
      originalname: name,
      mimetype: extToMime[ext] || 'image/jpeg',
      size: buffer.length,
      buffer,
    } as Express.Multer.File
    return saveUploadFile(this.prisma, file, u?.id ? `driver#${u.id}` : 'anonymous')
  }
}
