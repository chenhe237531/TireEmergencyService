import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { createParamDecorator, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import jwt from 'jsonwebtoken'
import { BizError, Err } from './response'

const SECRET = process.env.JWT_SECRET || 'tire-demo-secret'
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production')
  console.warn('[tire] 未设置 JWT_SECRET，正在使用演示默认密钥，令牌可被伪造；请在部署环境变量中配置随机密钥')

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
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const aud = this.reflector.getAllAndOverride<string>('aud', [ctx.getHandler(), ctx.getClass()])
    const optional = this.reflector.getAllAndOverride<boolean>('optionalAuth', [ctx.getHandler(), ctx.getClass()])
    const req = ctx.switchToHttp().getRequest()
    const p = parse(req)
    if (p && (!aud || p.aud === aud)) {
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
