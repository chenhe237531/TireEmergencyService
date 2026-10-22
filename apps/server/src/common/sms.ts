/**
 * 短信验证码：只存 HMAC-SHA256 哈希；生产必须配置 SMS_CODE_SECRET，缺失时启动失败。
 * 本地开发可使用固定演示验证码（SMS_DEMO_CODE，默认 123456），生产环境一律禁用。
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { BizError } from './response'

const SECRET = process.env.SMS_CODE_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'tire-demo-sms-secret')
if (!SECRET) throw new Error('[tire] 生产环境必须设置 SMS_CODE_SECRET（验证码 HMAC 密钥）')

export const SMS_CODE_TTL_MS = 5 * 60 * 1000
export const SMS_MAX_ATTEMPTS = 5
export const SMS_RESEND_INTERVAL_MS = 60 * 1000
export const SMS_PHONE_DAILY_LIMIT = 5
export const SMS_IP_HOURLY_LIMIT = 10

/** 演示验证码仅限非生产环境；生产环境永远返回空字符串 */
export function demoCode(): string {
  if (process.env.NODE_ENV === 'production') return ''
  return process.env.SMS_DEMO_CODE || '123456'
}

export function generateCode(): string {
  return demoCode() || String(randomInt(0, 1000000)).padStart(6, '0')
}

export function hashCode(phone: string, code: string): string {
  return createHmac('sha256', SECRET).update(`${phone}:${code}`).digest('hex')
}

export function verifyCode(phone: string, code: string, codeHash: string): boolean {
  const a = Buffer.from(hashCode(phone, code), 'utf8')
  const b = Buffer.from(codeHash, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * 发送短信：未接入服务商时生产环境直接报错，避免「发送成功」却收不到短信。
 * 本地演示模式只打印到服务端日志（同时接口会返回 demoCode 便于联调）。
 */
export async function sendCode(phone: string, code: string) {
  if (demoCode()) {
    console.log(`[tire] 演示验证码 ${phone} -> ${code}`)
    return
  }
  throw new BizError(40020, '短信服务未配置，请联系平台管理员')
}
