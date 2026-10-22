/**
 * 微信服务端能力封装：code2Session 之外的 access_token / 手机号快速验证。
 * 未配置 WX_APPID / WX_SECRET 时由调用方决定是否允许演示登录。
 */
import { BizError } from './response'

export function wxConfigured() {
  return !!(process.env.WX_APPID && process.env.WX_SECRET)
}

/** 生产环境默认关闭演示登录；本地开发或显式 ALLOW_DEMO_LOGIN=1 时开启 */
export function demoLoginAllowed() {
  return process.env.ALLOW_DEMO_LOGIN === '1' || process.env.NODE_ENV !== 'production'
}

interface TokenCache {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache = { token: '', expiresAt: 0 }

export async function getWxAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) return tokenCache.token
  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appid || !secret) throw new BizError(40020, '微信登录未配置')
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const r: any = await fetch(url).then(res => res.json()).catch(() => null)
  if (!r || r.errcode) throw new BizError(40020, `微信服务暂不可用（${r?.errcode || 'network'}）`)
  tokenCache = {
    token: r.access_token,
    // 提前 5 分钟过期，避免边界失效
    expiresAt: Date.now() + Math.max(60, Number(r.expires_in) || 7200) * 1000 - 5 * 60 * 1000,
  }
  return tokenCache.token
}

/** 小程序手机号快速验证：用前端 getPhoneNumber 拿到的 code 换真实手机号 */
export async function getWxPhoneNumber(code: string) {
  if (!code) throw new BizError(40020, '缺少微信手机号授权 code')
  const token = await getWxAccessToken()
  const r: any = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(res => res.json()).catch(() => null)
  if (!r || r.errcode) throw new BizError(40020, `手机号验证失败（${r?.errcode || 'network'} ${r?.errmsg || ''}）`.trim())
  const phone = r.phone_info?.purePhoneNumber || r.phone_info?.phoneNumber || ''
  if (!/^1\d{10}$/.test(phone)) throw new BizError(40020, '微信返回的手机号格式不正确')
  return phone
}
