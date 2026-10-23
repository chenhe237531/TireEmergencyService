import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { createParamDecorator, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import jwt from 'jsonwebtoken'
import { PrismaService } from './prisma.service'
import { BizError, Err } from './response'

/**
 * 生产环境必须显式配置 JWT_SECRET（至少 32 字符），缺失或过短时直接启动失败，
 * 避免用公开演示密钥或弱密钥签发可伪造令牌。
 * 本地开发保留默认值，便于开箱运行。
 */
const JWT_MIN_LENGTH = 32
const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'tire-demo-secret')
if (!SECRET) throw new Error('[tire] 生产环境必须设置 JWT_SECRET（随机长字符串）')
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET && process.env.JWT_SECRET.length < JWT_MIN_LENGTH)
  throw new Error(`[tire] 生产环境 JWT_SECRET 长度至少 ${JWT_MIN_LENGTH} 字符，请使用随机长字符串`)
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production')
  console.warn('[tire] 未设置 JWT_SECRET，本地开发使用默认密钥；生产环境必须配置')

export interface DriverUser { aud: 'app', id: number }
export interface StaffUser { aud: 'admin', id: number, role: string, name: string }

/** 两端令牌签发方（aud）不同，不能互用 */
export function signToken(payload: Record<string, any>, aud: 'app' | 'admin') {
  return jwt.sign(payload, SECRET, { audience: aud, expiresIn: aud === 'app' ? '30d' : '12h' })
}

function parse(req: any) {
  const h: string = req.headers?.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query?.token as string)
  if (!token) return null
  try {
    const p = jwt.verify(token, SECRET) as any
    return p
  }
  catch {
    return null
  }
}

@Injectable()
export class AudGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const aud = this.reflector.getAllAndOverride<string>('aud', [ctx.getHandler(), ctx.getClass()])
    const optional = this.reflector.getAllAndOverride<boolean>('optionalAuth', [ctx.getHandler(), ctx.getClass()])
    const req = ctx.switchToHttp().getRequest()
    const p = parse(req)
    if (p && (!aud || p.aud === aud)) {
      // 每次请求都校验账号状态：封禁司机 / 停用员工立即失效，不能靠旧令牌继续操作
      if (p.aud === 'app') {
        const driver = await this.prisma.driver.findUnique({ where: { id: p.id }, select: { status: true } })
        if (!driver) throw Err.unauth()
        if (driver.status !== 'active') throw new BizError(40003, '账号已被封禁，请联系平台客服')
      }
      else if (p.aud === 'admin') {
        // ver = 密码版本号：修改密码后 +1，旧令牌立即失效（历史签发的令牌无 ver 按 0 处理）
        const staff = await this.prisma.staff.findUnique({ where: { id: p.id }, select: { status: true, tokenVersion: true } })
        if (!staff) throw Err.unauth()
        if (staff.status !== 'active') throw new BizError(40003, '账号已停用，请联系超级管理员')
        if (((p.ver as number | undefined) ?? 0) !== staff.tokenVersion) throw Err.unauth()
      }
      req.user = p
      return true
    }
    if (optional) return true
    throw Err.unauth()
  }
}

export const Aud = (aud: 'app' | 'admin') => applyDecorators(SetMetadata('aud', aud), UseGuards(AudGuard))
/** 可选登录：带 token 就注入 user，不带也放行（游客可提交咨询表单等场景） */
export const OptionalAuth = () => SetMetadata('optionalAuth', true)
export const Public = () => SetMetadata('optionalAuth', true)

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user
})

export function requireRole(user: StaffUser, roles: string[]) {
  if (user.role === 'super_admin' || roles.includes(user.role)) return
  throw new BizError(40003, '当前角色没有权限执行此操作')
}

export const ROLE_NAMES: Record<string, string> = {
  super_admin: '超级管理员',
  ops: '平台运营',
}
