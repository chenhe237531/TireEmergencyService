import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { FileInterceptor } from '@nestjs/platform-express/multer'
import { Aud, CurrentUser, ROLE_NAMES, StaffUser, signToken } from '../common/auth'
import { Err } from '../common/response'
import { saveUploadFile } from '../common/upload'
import { addDays, fmt, hashPwd, today } from '../common/util'
import { DRIVER_ROLES, STORE_CATEGORIES } from './app.controller'
import { PrismaService } from '../common/prisma.service'

/** 工单状态机：pending → contacting → resolved / cancelled */
const FLOW: Record<string, string[]> = {
  pending: ['contacting', 'resolved', 'cancelled'],
  contacting: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
}
const STATUS_NAMES: Record<string, string> = { pending: '待处理', contacting: '跟进中', resolved: '已解决', cancelled: '已取消' }

function pageArgs(q: { page?: string, pageSize?: string }) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private prisma: PrismaService) {}

  /** 后台登录：员工账号密码（sha256 校验），签发 admin 令牌 */
  @Post('login')
  async login(@Body() body: { username: string, password: string }) {
    const staff = await this.prisma.staff.findUnique({ where: { username: body.username || '' } })
    if (!staff || staff.password !== hashPwd(body.password || '') || staff.status !== 'active')
      throw Err.bad('账号或密码错误')
    await this.prisma.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } })
    return {
      accessToken: signToken({ id: staff.id, role: staff.role, name: staff.name }, 'admin'),
      user: { id: staff.id, name: staff.name, username: staff.username, role: staff.role, roleName: ROLE_NAMES[staff.role] || staff.role },
    }
  }
}

@Controller('admin')
@Aud('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // ─── 工作台 ───

  /** 工作台统计：今日救援/咨询、待处理数、司机/门店总数、近 7 天趋势 */
  @Get('dashboard/stats')
  async dashboard() {
    const dayStart = new Date(`${today()}T00:00:00`)
    const [todayRescue, todayConsult, pendingRescue, pendingConsult, driverCount, storeCount] = await Promise.all([
      this.prisma.rescueAlert.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.consultRequest.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.rescueAlert.count({ where: { status: 'pending' } }),
      this.prisma.consultRequest.count({ where: { status: 'pending' } }),
      this.prisma.driver.count(),
      this.prisma.store.count(),
    ])
    const trend: { date: string, rescue: number, consult: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = addDays(-i)
      const start = new Date(`${fmt(d, 'YYYY-MM-DD')}T00:00:00`)
      const end = addDays(1, start)
      trend.push({
        date: fmt(d, 'MM-DD'),
        rescue: await this.prisma.rescueAlert.count({ where: { createdAt: { gte: start, lt: end } } }),
        consult: await this.prisma.consultRequest.count({ where: { createdAt: { gte: start, lt: end } } }),
      })
    }
    return { todayRescue, todayConsult, pendingRescue, pendingConsult, driverCount, storeCount, trend }
  }

  // ─── 门店管理 ───

  @Get('stores')
  async stores(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('page') _page?: string,
    @Query('pageSize') _pageSize?: string,
  ) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
    const where = {
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({ where, orderBy: [{ sort: 'desc' }, { id: 'desc' }], skip, take }),
    ])
    return { list, total, page, pageSize }
  }

  /** 新建门店（信息由后台录入；地址电话仅后台可见） */
  @Post('stores')
  async createStore(@CurrentUser() _u: StaffUser, @Body() b: Record<string, any>) {
    this.checkStoreBody(b)
    return this.prisma.store.create({ data: this.storeData(b) as any })
  }

  @Patch('stores/:id')
  async updateStore(@Param('id', ParseIntPipe) id: number, @Body() b: Record<string, any>) {
    await this.mustStore(id)
    this.checkStoreBody(b, true)
    return this.prisma.store.update({ where: { id }, data: this.storeData(b) as any })
  }

  @Delete('stores/:id')
  async deleteStore(@Param('id', ParseIntPipe) id: number) {
    const nid = id
    const used = await this.prisma.viewLog.count({ where: { storeId: nid } })
    if (used) {
      // 有浏览痕迹的门店不做物理删除，改为隐藏，保留历史数据
      await this.mustStore(nid)
      return this.prisma.store.update({ where: { id: nid }, data: { status: 'hidden' } })
    }
    await this.mustStore(nid)
    await this.prisma.store.delete({ where: { id: nid } })
    return { ok: true }
  }

  private async mustStore(id: number) {
    const s = await this.prisma.store.findUnique({ where: { id } })
    if (!s) throw Err.notFound('门店不存在')
    return s
  }

  private checkStoreBody(b: Record<string, any>, partial = false) {
    if (!partial || b.name !== undefined) if (!String(b.name || '').trim()) throw Err.bad('请填写门店名称')
    if (!partial || b.category !== undefined) if (!STORE_CATEGORIES[b.category]) throw Err.bad('请选择正确的门店分类')
    for (const k of ['lat', 'lng'] as const) {
      if (b[k] === undefined) continue
      const v = Number(b[k])
      if (Number.isNaN(v)) throw Err.bad('经纬度必须是数字')
      if (k === 'lat' && (v < -90 || v > 90)) throw Err.bad('纬度范围 -90 ~ 90')
      if (k === 'lng' && (v < -180 || v > 180)) throw Err.bad('经度范围 -180 ~ 180')
    }
    if (!partial && (b.lat === undefined || b.lng === undefined)) throw Err.bad('请填写门店经纬度')
  }

  private storeData(b: Record<string, any>) {
    const data: Record<string, any> = {}
    const strKeys = ['name', 'mainServices', 'address', 'phone', 'contactName', 'areaLabel', 'category', 'status']
    for (const k of strKeys) if (b[k] !== undefined) data[k] = String(b[k]).trim()
    if (b.lat !== undefined) data.lat = Number(b.lat)
    if (b.lng !== undefined) data.lng = Number(b.lng)
    if (b.score !== undefined) data.score = Math.min(5, Math.max(0, Number(b.score) || 0))
    if (b.sort !== undefined) data.sort = Math.trunc(Number(b.sort) || 0)
    return data
  }

  // ─── 救援通知 ───

  @Get('rescue-alerts/unread-count')
  async rescueUnread() {
    const rescue = await this.prisma.rescueAlert.count({ where: { status: 'pending' } })
    const consult = await this.prisma.consultRequest.count({ where: { status: 'pending' } })
    return { rescue, consult, total: rescue + consult }
  }

  @Get('rescue-alerts')
  async rescueAlerts(
    @Query('status') status?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') _page?: string,
    @Query('pageSize') _pageSize?: string,
  ) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
    const range: any = {}
    if (start) range.gte = new Date(`${start}T00:00:00`)
    if (end) range.lte = new Date(`${end}T23:59:59`)
    const where = {
      ...(status ? { status } : {}),
      ...(start || end ? { createdAt: range } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.rescueAlert.count({ where }),
      this.prisma.rescueAlert.findMany({
        where, orderBy: { id: 'desc' }, skip, take,
        include: { driver: { select: { id: true, nickname: true, phone: true, role: true } } },
      }),
    ])
    return {
      list: list.map(r => ({
        ...r,
        statusName: STATUS_NAMES[r.status],
        driverPhone: r.driver?.phone || '',
        driverRoleName: r.driver ? DRIVER_ROLES[r.driver.role] || '' : '',
      })),
      total, page, pageSize,
    }
  }

  /** 状态流转 + 跟进备注（状态机校验，乱序拒绝） */
  @Patch('rescue-alerts/:id')
  async handleRescue(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: { status?: string, note?: string }) {
    const row = await this.prisma.rescueAlert.findUnique({ where: { id: id } })
    if (!row) throw Err.notFound('通知不存在')
    let status = row.status
    if (b.status) {
      if (!FLOW[row.status].includes(b.status)) throw Err.conflict(`「${STATUS_NAMES[row.status]}」不能变更为「${STATUS_NAMES[b.status] || b.status}」`)
      status = b.status
    }
    return this.prisma.rescueAlert.update({
      where: { id: id },
      data: { status, note: b.note ?? row.note, handledBy: u.name, handledAt: new Date() },
    })
  }

  // ─── 咨询工单 ───

  @Get('consults')
  async consults(
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') _page?: string,
    @Query('pageSize') _pageSize?: string,
  ) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
    const range: any = {}
    if (start) range.gte = new Date(`${start}T00:00:00`)
    if (end) range.lte = new Date(`${end}T23:59:59`)
    const where = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ contactName: { contains: keyword } }, { contactPhone: { contains: keyword } }, { plateNo: { contains: keyword } }] } : {}),
      ...(start || end ? { createdAt: range } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.consultRequest.count({ where }),
      this.prisma.consultRequest.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
    ])
    return { list: list.map(r => ({ ...r, statusName: STATUS_NAMES[r.status] })), total, page, pageSize }
  }

  @Get('consults/:id')
  async consultDetail(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.consultRequest.findUnique({ where: { id: id }, include: { driver: { select: { id: true, nickname: true, phone: true, role: true } } } })
    if (!row) throw Err.notFound('工单不存在')
    return { ...row, statusName: STATUS_NAMES[row.status] }
  }

  @Patch('consults/:id')
  async handleConsult(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: { status?: string, note?: string }) {
    const row = await this.prisma.consultRequest.findUnique({ where: { id: id } })
    if (!row) throw Err.notFound('工单不存在')
    let status = row.status
    if (b.status) {
      if (!FLOW[row.status].includes(b.status)) throw Err.conflict(`「${STATUS_NAMES[row.status]}」不能变更为「${STATUS_NAMES[b.status] || b.status}」`)
      status = b.status
    }
    return this.prisma.consultRequest.update({
      where: { id: id },
      data: { status, note: b.note ?? row.note, handledBy: u.name, handledAt: new Date() },
    })
  }

  // ─── 司机与浏览痕迹 ───

  @Get('drivers')
  async drivers(
    @Query('keyword') keyword?: string,
    @Query('role') role?: string,
    @Query('page') _page?: string,
    @Query('pageSize') _pageSize?: string,
  ) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
    const where = {
      ...(role ? { role } : {}),
      ...(keyword ? { OR: [{ nickname: { contains: keyword } }, { phone: { contains: keyword } }] } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
    ])
    return {
      list: list.map(d => ({ ...d, openid: undefined, roleEmpty: !d.role, roleName: DRIVER_ROLES[d.role] || '未完善' })),
      total, page, pageSize,
    }
  }

  @Get('view-logs')
  async viewLogs(
    @Query('driverId') driverId?: string,
    @Query('storeId') storeId?: string,
    @Query('action') action?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') _page?: string,
    @Query('pageSize') _pageSize?: string,
  ) {
    const { skip, take, page, pageSize } = pageArgs({ page: _page, pageSize: _pageSize })
    const range: any = {}
    if (start) range.gte = new Date(`${start}T00:00:00`)
    if (end) range.lte = new Date(`${end}T23:59:59`)
    const where = {
      ...(driverId ? { driverId: Number(driverId) } : {}),
      ...(storeId ? { storeId: Number(storeId) } : {}),
      ...(action ? { action } : {}),
      ...(start || end ? { createdAt: range } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.viewLog.count({ where }),
      this.prisma.viewLog.findMany({
        where, orderBy: { id: 'desc' }, skip, take,
        include: {
          driver: { select: { id: true, nickname: true, phone: true } },
          store: { select: { id: true, name: true, category: true } },
        },
      }),
    ])
    return {
      list: list.map(l => ({ ...l, actionName: l.action === 'click' ? '点击' : '曝光', categoryName: STORE_CATEGORIES[l.store.category] || '' })),
      total, page, pageSize,
    }
  }

  // ─── 平台设置与 FAQ ───

  @Get('settings')
  async getSettings() {
    const rows = await this.prisma.setting.findMany()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }

  /** 批量保存设置（只收白名单 key） */
  @Patch('settings')
  async saveSettings(@Body() b: Record<string, string>) {
    const keys = ['servicePhone', 'wechatQr', 'about', 'userAgreement', 'privacyPolicy', 'shareTitle']
    for (const k of keys) {
      if (b[k] === undefined) continue
      await this.prisma.setting.upsert({ where: { key: k }, create: { key: k, value: String(b[k]) }, update: { value: String(b[k]) } })
    }
    return { ok: true }
  }

  @Get('faqs')
  async faqs(@Query('keyword') keyword?: string) {
    return this.prisma.faq.findMany({
      where: keyword ? { OR: [{ question: { contains: keyword } }, { answer: { contains: keyword } }] } : {},
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
    })
  }

  @Post('faqs')
  async createFaq(@Body() b: { question?: string, answer?: string, sort?: number }) {
    if (!b.question?.trim() || !b.answer?.trim()) throw Err.bad('问题和答案都不能为空')
    return this.prisma.faq.create({ data: { question: b.question.trim(), answer: b.answer.trim(), sort: Math.trunc(Number(b.sort) || 0) } })
  }

  @Patch('faqs/:id')
  async updateFaq(@Param('id', ParseIntPipe) id: number, @Body() b: { question?: string, answer?: string, sort?: number, status?: string }) {
    const row = await this.prisma.faq.findUnique({ where: { id: id } })
    if (!row) throw Err.notFound('FAQ 不存在')
    const data: Record<string, any> = {}
    if (b.question !== undefined) data.question = String(b.question).trim()
    if (b.answer !== undefined) data.answer = String(b.answer).trim()
    if (b.sort !== undefined) data.sort = Math.trunc(Number(b.sort) || 0)
    if (b.status !== undefined) data.status = b.status === 'hidden' ? 'hidden' : 'active'
    return this.prisma.faq.update({ where: { id: id }, data })
  }

  @Delete('faqs/:id')
  async deleteFaq(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.faq.delete({ where: { id: id } }).catch(() => { throw Err.notFound('FAQ 不存在') })
    return { ok: true }
  }

  /** 后台上传（客服二维码等） */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(@CurrentUser() u: StaffUser, @UploadedFile() file: Express.Multer.File) {
    return saveUploadFile(this.prisma, file, `staff#${u.id}`)
  }
}
