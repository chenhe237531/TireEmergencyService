import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { FileInterceptor } from '@nestjs/platform-express/multer'
import { Aud, CurrentUser, ROLE_NAMES, StaffUser, requireRole, signToken } from '../common/auth'
import { Err } from '../common/response'
import { RESCUE_VEHICLE_TYPES, TICKET_FLOW, TICKET_SLA_MINUTES, TICKET_STATUS_NAMES, VEHICLE_STORE_CATEGORIES } from '../common/ticket'
import { saveUploadFile } from '../common/upload'
import { addDays, distanceLabel, fmt, hashPwd, haversineKm, today, verifyPwd } from '../common/util'
import { DRIVER_ROLES, STORE_CATEGORIES } from './app.controller'
import { PrismaService } from '../common/prisma.service'

/** 后台登录失败限流：同 IP + 账号 15 分钟内最多 5 次，降低撞库风险（多实例下为单实例内存限流） */
const LOGIN_FAILED = new Map<string, { count: number, until: number }>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAIL = 5

function loginKey(ip: string, username: string) {
  return `${ip}|${username.trim().toLowerCase()}`
}

function pageArgs(q: { page?: string, pageSize?: string }) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private prisma: PrismaService) {}

  /** 后台登录：scrypt 密码校验（兼容旧 sha256 并自动升级），签发 admin 令牌 */
  @Post('login')
  async login(@Body() body: { username: string, password: string }, @Req() req: any) {
    const key = loginKey(req.ip || req.socket?.remoteAddress || '', body.username || '')
    const fail = LOGIN_FAILED.get(key)
    if (fail && fail.until > Date.now() && fail.count >= LOGIN_MAX_FAIL)
      throw Err.bad('尝试次数过多，请 15 分钟后再试')
    const staff = await this.prisma.staff.findUnique({ where: { username: body.username || '' } })
    if (!staff || !verifyPwd(body.password || '', staff.password) || staff.status !== 'active') {
      const next = fail && fail.until > Date.now() ? fail.count + 1 : 1
      LOGIN_FAILED.set(key, { count: next, until: Date.now() + LOGIN_WINDOW_MS })
      throw Err.bad('账号或密码错误')
    }
    LOGIN_FAILED.delete(key)
    // 旧库仍是 sha256，登录成功后顺手升级为 scrypt
    if (!staff.password.startsWith('scrypt$'))
      await this.prisma.staff.update({ where: { id: staff.id }, data: { password: hashPwd(body.password || '') } })
    await this.prisma.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } })
    return {
      accessToken: signToken({ id: staff.id, role: staff.role, name: staff.name }, 'admin'),
      user: { id: staff.id, name: staff.name, username: staff.username, role: staff.role, roleName: ROLE_NAMES[staff.role] || staff.role },
    }
  }

  /** 修改自己的登录密码：新密码至少 8 位，原密码必须正确 */
  @Post('password')
  @Aud('admin')
  async changePassword(@CurrentUser() u: StaffUser, @Body() body: { oldPassword?: string, newPassword?: string }) {
    if (!body.newPassword || body.newPassword.length < 8) throw Err.bad('新密码至少 8 位')
    const staff = await this.prisma.staff.findUnique({ where: { id: u.id } })
    if (!staff || !verifyPwd(body.oldPassword || '', staff.password)) throw Err.bad('原密码错误')
    await this.prisma.staff.update({ where: { id: staff.id }, data: { password: hashPwd(body.newPassword) } })
    return { ok: true }
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
  async createStore(@CurrentUser() u: StaffUser, @Body() b: Record<string, any>) {
    requireRole(u, ['ops'])
    this.checkStoreBody(b)
    return this.prisma.store.create({ data: this.storeData(b) as any })
  }

  @Patch('stores/:id')
  async updateStore(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: Record<string, any>) {
    requireRole(u, ['ops'])
    await this.mustStore(id)
    this.checkStoreBody(b, true)
    return this.prisma.store.update({ where: { id }, data: this.storeData(b) as any })
  }

  @Delete('stores/:id')
  async deleteStore(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number) {
    requireRole(u, ['super_admin'])
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
    if (b.status !== undefined && !['active', 'hidden'].includes(b.status)) throw Err.bad('门店状态参数错误')
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
    const overdueBefore = new Date(Date.now() - TICKET_SLA_MINUTES * 60 * 1000)
    const [rescue, consult, overdueRescue, overdueConsult] = await Promise.all([
      this.prisma.rescueAlert.count({ where: { status: 'pending' } }),
      this.prisma.consultRequest.count({ where: { status: 'pending' } }),
      this.prisma.rescueAlert.count({ where: { status: 'pending', createdAt: { lt: overdueBefore } } }),
      this.prisma.consultRequest.count({ where: { status: 'pending', createdAt: { lt: overdueBefore } } }),
    ])
    return { rescue, consult, overdueRescue, overdueConsult, total: rescue + consult }
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
    const overdueBefore = new Date(Date.now() - TICKET_SLA_MINUTES * 60 * 1000)
    const [total, list] = await Promise.all([
      this.prisma.rescueAlert.count({ where }),
      this.prisma.rescueAlert.findMany({
        where, orderBy: { id: 'desc' }, skip, take,
        include: {
          driver: { select: { id: true, nickname: true, phone: true, role: true } },
          assignedStore: { select: { id: true, name: true, category: true, areaLabel: true, phone: true } },
        },
      }),
    ])
    return {
      list: list.map(r => ({
        ...r,
        vehicleTypeName: RESCUE_VEHICLE_TYPES[r.vehicleType] || '其他',
        statusName: TICKET_STATUS_NAMES[r.status] || r.status,
        driverPhone: r.driver?.phone || '',
        driverRoleName: r.driver ? DRIVER_ROLES[r.driver.role] || '' : '',
        overdue: r.status === 'pending' && r.createdAt < overdueBefore,
      })),
      total, page, pageSize,
    }
  }

  /** 救援详情 + 操作流水：处理弹窗用来展示完整上下文 */
  @Get('rescue-alerts/:id')
  async rescueDetail(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.rescueAlert.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, nickname: true, phone: true, role: true, status: true } },
        assignedStore: { select: { id: true, name: true, category: true, areaLabel: true, phone: true, address: true, contactName: true } },
      },
    })
    if (!row) throw Err.notFound('通知不存在')
    const logs = await this.prisma.ticketLog.findMany({ where: { ticketType: 'rescue', ticketId: id }, orderBy: { id: 'asc' } })
    return {
      ...row,
      vehicleTypeName: RESCUE_VEHICLE_TYPES[row.vehicleType] || '其他',
      statusName: TICKET_STATUS_NAMES[row.status] || row.status,
      driverPhone: row.driver?.phone || '',
      driverRoleName: row.driver ? DRIVER_ROLES[row.driver.role] || '' : '',
      logs,
    }
  }

  /** 按车型推荐附近门店：后台派单时直接看距离与电话，不用再跳出工单翻门店 */
  @Get('rescue-alerts/:id/nearby-stores')
  async nearbyStores(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.rescueAlert.findUnique({ where: { id } })
    if (!row) throw Err.notFound('通知不存在')
    if (row.lat == null || row.lng == null) return []
    const categories = VEHICLE_STORE_CATEGORIES[row.vehicleType] || VEHICLE_STORE_CATEGORIES.other
    const stores = await this.prisma.store.findMany({ where: { status: 'active', category: { in: categories } } })
    return stores
      .map(s => {
        const distanceKm = Math.round(haversineKm(row.lat!, row.lng!, s.lat, s.lng) * 100) / 100
        return {
          id: s.id,
          name: s.name,
          category: s.category,
          categoryName: STORE_CATEGORIES[s.category] || s.category,
          areaLabel: s.areaLabel,
          address: s.address,
          phone: s.phone,
          contactName: s.contactName,
          distanceKm,
          distanceLabel: distanceLabel(distanceKm),
        }
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5)
  }

  /** 状态流转 + 跟进备注 + 指派门店（状态机校验，乱序拒绝；每次变更写操作流水） */
  @Patch('rescue-alerts/:id')
  async handleRescue(
    @CurrentUser() u: StaffUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() b: { status?: string, note?: string, assignedStoreId?: number | null },
  ) {
    const row = await this.prisma.rescueAlert.findUnique({ where: { id } })
    if (!row) throw Err.notFound('通知不存在')
    let status = row.status
    if (b.status) {
      if (!(TICKET_FLOW[row.status] || []).includes(b.status))
        throw Err.conflict(`「${TICKET_STATUS_NAMES[row.status]}」不能变更为「${TICKET_STATUS_NAMES[b.status] || b.status}」`)
      status = b.status
    }

    let assignedStoreId = row.assignedStoreId
    let assignedAt = row.assignedAt
    let assignedStoreName = ''
    if (b.assignedStoreId !== undefined) {
      if (b.assignedStoreId === null) {
        assignedStoreId = null
        assignedAt = null
        assignedStoreName = '取消指派'
      }
      else {
        const sid = Number(b.assignedStoreId)
        if (!Number.isInteger(sid) || sid <= 0) throw Err.bad('门店参数错误')
        const store = await this.prisma.store.findUnique({ where: { id: sid }, select: { id: true, name: true } })
        if (!store) throw Err.notFound('门店不存在')
        if (assignedStoreId !== sid) assignedAt = new Date()
        assignedStoreId = sid
        assignedStoreName = store.name
      }
    }

    const note = b.note !== undefined ? String(b.note).slice(0, 500) : row.note
    const logNote = [b.note !== undefined ? note : '', assignedStoreName ? `指派门店：${assignedStoreName}` : ''].filter(Boolean).join('；') || note
    const [updated] = await this.prisma.$transaction([
      this.prisma.rescueAlert.update({
        where: { id },
        data: { status, note, handledBy: u.name, handledAt: new Date(), assignedStoreId, assignedAt },
      }),
      this.prisma.ticketLog.create({
        data: {
          ticketType: 'rescue', ticketId: id, fromStatus: row.status, toStatus: status,
          note: logNote, operatorId: u.id, operatorName: u.name,
        },
      }),
    ])
    return {
      ...updated,
      vehicleTypeName: RESCUE_VEHICLE_TYPES[updated.vehicleType] || '其他',
      statusName: TICKET_STATUS_NAMES[updated.status] || updated.status,
    }
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
    const overdueBefore = new Date(Date.now() - TICKET_SLA_MINUTES * 60 * 1000)
    const [total, list] = await Promise.all([
      this.prisma.consultRequest.count({ where }),
      this.prisma.consultRequest.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
    ])
    return {
      list: list.map(r => ({
        ...r,
        statusName: TICKET_STATUS_NAMES[r.status] || r.status,
        overdue: r.status === 'pending' && r.createdAt < overdueBefore,
      })),
      total, page, pageSize,
    }
  }

  @Get('consults/:id')
  async consultDetail(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.consultRequest.findUnique({ where: { id: id }, include: { driver: { select: { id: true, nickname: true, phone: true, role: true } } } })
    if (!row) throw Err.notFound('工单不存在')
    const logs = await this.prisma.ticketLog.findMany({ where: { ticketType: 'consult', ticketId: id }, orderBy: { id: 'asc' } })
    return { ...row, statusName: TICKET_STATUS_NAMES[row.status] || row.status, logs }
  }

  @Patch('consults/:id')
  async handleConsult(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: { status?: string, note?: string }) {
    const row = await this.prisma.consultRequest.findUnique({ where: { id: id } })
    if (!row) throw Err.notFound('工单不存在')
    let status = row.status
    if (b.status) {
      if (!(TICKET_FLOW[row.status] || []).includes(b.status))
        throw Err.conflict(`「${TICKET_STATUS_NAMES[row.status]}」不能变更为「${TICKET_STATUS_NAMES[b.status] || b.status}」`)
      status = b.status
    }
    const note = b.note !== undefined ? String(b.note).slice(0, 500) : row.note
    const [updated] = await this.prisma.$transaction([
      this.prisma.consultRequest.update({
        where: { id: id },
        data: { status, note, handledBy: u.name, handledAt: new Date() },
      }),
      this.prisma.ticketLog.create({
        data: {
          ticketType: 'consult', ticketId: id, fromStatus: row.status, toStatus: status,
          note, operatorId: u.id, operatorName: u.name,
        },
      }),
    ])
    return { ...updated, statusName: TICKET_STATUS_NAMES[updated.status] || updated.status }
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
      // role=empty 表示「未完善身份」，直接在服务端过滤，避免前端拉 200 条再截断
      ...(role === 'empty' ? { role: '' } : role ? { role } : {}),
      ...(keyword ? { OR: [{ nickname: { contains: keyword } }, { phone: { contains: keyword } }] } : {}),
    }
    const [total, list] = await Promise.all([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
    ])
    return {
      list: list.map(d => ({
        ...d,
        openid: undefined,
        roleEmpty: !d.role,
        roleName: DRIVER_ROLES[d.role] || '未完善',
        statusName: d.status === 'blocked' ? '已封禁' : '正常',
      })),
      total, page, pageSize,
    }
  }

  /** 封禁 / 解封司机：封禁后其旧令牌在下一次请求即被 AudGuard 拦截 */
  @Patch('drivers/:id')
  async updateDriver(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: { status?: string }) {
    requireRole(u, ['super_admin'])
    if (!b.status || !['active', 'blocked'].includes(b.status)) throw Err.bad('司机状态参数错误')
    const driver = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } })
    if (!driver) throw Err.notFound('司机不存在')
    const updated = await this.prisma.driver.update({ where: { id }, data: { status: b.status } })
    return { id: updated.id, status: updated.status, statusName: updated.status === 'blocked' ? '已封禁' : '正常' }
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

  /** 批量保存设置（只收白名单 key）：平台级配置仅超级管理员可改 */
  @Patch('settings')
  async saveSettings(@CurrentUser() u: StaffUser, @Body() b: Record<string, string>) {
    requireRole(u, ['super_admin'])
    if (b.servicePhone !== undefined && !/^(1[3-9]\d{9}|(400|800)-?\d{3}-?\d{4})$/.test(String(b.servicePhone).trim()))
      throw Err.bad('请输入正确的客服电话')
    const keys = ['servicePhone', 'wechatQr', 'about', 'userAgreement', 'privacyPolicy', 'shareTitle']
    for (const k of keys) {
      if (b[k] === undefined) continue
      const value = String(b[k]).slice(0, 20000)
      await this.prisma.setting.upsert({ where: { key: k }, create: { key: k, value }, update: { value } })
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
  async createFaq(@CurrentUser() u: StaffUser, @Body() b: { question?: string, answer?: string, sort?: number }) {
    requireRole(u, ['ops'])
    if (!b.question?.trim() || !b.answer?.trim()) throw Err.bad('问题和答案都不能为空')
    return this.prisma.faq.create({ data: { question: b.question.trim(), answer: b.answer.trim(), sort: Math.trunc(Number(b.sort) || 0) } })
  }

  @Patch('faqs/:id')
  async updateFaq(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number, @Body() b: { question?: string, answer?: string, sort?: number, status?: string }) {
    requireRole(u, ['ops'])
    const row = await this.prisma.faq.findUnique({ where: { id: id } })
    if (!row) throw Err.notFound('FAQ 不存在')
    const data: Record<string, any> = {}
    if (b.question !== undefined) {
      const question = String(b.question).trim()
      if (!question) throw Err.bad('问题不能为空')
      data.question = question
    }
    if (b.answer !== undefined) {
      const answer = String(b.answer).trim()
      if (!answer) throw Err.bad('答案不能为空')
      data.answer = answer
    }
    if (b.sort !== undefined) data.sort = Math.trunc(Number(b.sort) || 0)
    if (b.status !== undefined) {
      if (!['active', 'hidden'].includes(b.status)) throw Err.bad('FAQ 状态参数错误')
      data.status = b.status
    }
    return this.prisma.faq.update({ where: { id: id }, data })
  }

  @Delete('faqs/:id')
  async deleteFaq(@CurrentUser() u: StaffUser, @Param('id', ParseIntPipe) id: number) {
    requireRole(u, ['super_admin'])
    await this.prisma.faq.delete({ where: { id: id } }).catch(() => { throw Err.notFound('FAQ 不存在') })
    return { ok: true }
  }

  /** 后台上传（客服二维码等） */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(@CurrentUser() u: StaffUser, @UploadedFile() file: Express.Multer.File) {
    return saveUploadFile(this.prisma, file, `staff#${u.id}`)
  }
}
