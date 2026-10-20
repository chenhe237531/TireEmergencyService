import { Body, Controller, Get, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { FileInterceptor } from '@nestjs/platform-express/multer'
import { createHash } from 'node:crypto'
import { Aud, CurrentUser, DriverUser, OptionalAuth, signToken } from '../common/auth'
import { BizError, Err } from '../common/response'
import { saveUploadFile } from '../common/upload'
import { distanceLabel, haversineKm, pick } from '../common/util'
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

/** 微信 code2Session 返回结构（截取需要的字段） */
interface WxSession { openid: string, unionid?: string }

/**
 * 微信登录：配置了 WX_APPID / WX_SECRET 时走真实 code2Session；
 * 未配置（开发期）则按客户端传入的 code/设备标识生成稳定演示 openid，
 * 配置好环境变量后无需改代码自动切换为真实登录。
 */
async function codeToOpenid(code: string): Promise<WxSession> {
  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (appid && secret) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const r: any = await fetch(url).then(res => res.json())
    if (r.errcode) throw new BizError(40020, `微信登录失败（${r.errcode} ${r.errmsg}）`)
    return { openid: r.openid, unionid: r.unionid }
  }
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
    if (!driver.lastLoginAt) await this.prisma.driver.update({ where: { id: driver.id }, data: { lastLoginAt: new Date() } })
    return {
      accessToken: signToken({ id: driver.id }, 'app'),
      user: this.view(driver),
    }
  }

  /**
   * 绑定手机号。演示模式直接传 phone；
   * 真实模式预留 wxPhoneCode（微信手机号快速验证组件的 code），配置好小程序资质后启用。
   */
  @Post('auth/phone')
  @Aud('app')
  async bindPhone(@CurrentUser() u: DriverUser, @Body() body: { phone?: string, wxPhoneCode?: string }) {
    // TODO 正式版：wxPhoneCode 调用 getuserphonenumber 接口换取真实手机号（需企业认证小程序）
    if (!body.phone || !/^1\d{10}$/.test(body.phone)) throw Err.bad('请输入正确的手机号')
    const driver = await this.prisma.driver.update({ where: { id: u.id }, data: { phone: body.phone } })
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

  /** 浏览/点击埋点：后台据此判断司机意向，主动线下对接 */
  @Post('view-log')
  async viewLog(@CurrentUser() u: DriverUser, @Body() body: { storeId: number, action?: string }) {
    const store = await this.prisma.store.findUnique({ where: { id: Number(body.storeId) } })
    if (!store) throw Err.notFound('门店不存在')
    const action = body.action === 'click' ? 'click' : 'view'
    await this.prisma.viewLog.create({ data: { driverId: u.id, storeId: store.id, action } })
    return { ok: true }
  }

  /**
   * 故障找救援：一键触发，后台实时收到待处理通知。
   * 需要已绑定手机号（平台要电话联系司机），否则返回 40011 引导绑定。
   */
  @Post('rescue-alert')
  async rescueAlert(
    @CurrentUser() u: DriverUser,
    @Body() body: { lat?: number, lng?: number, locationDesc?: string },
  ) {
    const d = await this.prisma.driver.findUnique({ where: { id: u.id } })
    if (!d) throw Err.unauth()
    if (!d.phone) throw Err.needPhone()
    const row = await this.prisma.rescueAlert.create({
      data: {
        driverId: u.id,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        locationDesc: body.locationDesc || '',
      },
    })
    return { id: row.id, status: row.status }
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
    const images = Array.isArray(body.images) ? body.images.filter(i => typeof i === 'string' && i.startsWith('/uploads/')).slice(0, 9) : []
    const row = await this.prisma.consultRequest.create({
      data: {
        driverId: u?.id ?? null,
        plateNo: (body.plateNo || '').trim().slice(0, 20),
        carModel: (body.carModel || '').trim().slice(0, 50),
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        locationDesc: (body.locationDesc || '').trim(),
        description: body.description.trim().slice(0, 1000),
        images,
        contactName: body.contactName.trim().slice(0, 30),
        contactPhone: body.contactPhone!.trim(),
      },
    })
    return { id: row.id, status: row.status }
  }

  /** 平台设置：客服电话 / 二维码 / 关于我们 / 协议 / 分享文案 */
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
    }
  }

  /** 常见问题（支付 / 退款 / 服务流程） */
  @Get('faqs')
  @OptionalAuth()
  async faqs() {
    return this.prisma.faq.findMany({ where: { status: 'active' }, orderBy: [{ sort: 'desc' }, { id: 'asc' }], select: { id: true, question: true, answer: true } })
  }

  /** 图片上传（故障描述配图 / 客服二维码等），存数据库，返回 /uploads/<name> */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(@CurrentUser() u: DriverUser, @UploadedFile() file: Express.Multer.File) {
    return saveUploadFile(this.prisma, file, `driver#${u.id}`)
  }
}
