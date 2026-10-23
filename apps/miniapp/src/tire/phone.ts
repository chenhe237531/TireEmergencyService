/**
 * 手机号绑定（登录司机补 / 换手机号）
 *
 * 首页、我的、个人资料三个入口共用：
 * 演示环境手动输入；真实微信环境用 getPhoneNumber 快速验证。
 * UI 弹层见 components/tire/TPhoneSheet.vue。
 */
import { ref } from 'vue'
import { http } from './request'
import { loadAppSettings } from './settings'
import { useTire } from './store'
import type { WxPhoneEvent } from './types'
import { errText, toast } from './utils'

export interface PhoneBindOptions {
  /** 绑定成功的提示文案 */
  boundToast?: string
  /** 绑定成功后的回调（此时全局 me 已刷新） */
  onBound?: () => void | Promise<void>
}

export function usePhoneBind(options: PhoneBindOptions = {}) {
  const tire = useTire()
  const phoneVal = ref('')
  const phoneErr = ref('')
  const phoneLoading = ref(false)
  /** 演示环境允许手动输入；真实微信环境只显示快捷授权按钮 */
  const demoLogin = ref(true)

  /** 打开弹层前调用：刷新演示标记 */
  async function prepare() {
    try {
      const s = await loadAppSettings()
      demoLogin.value = s.demoLogin !== false
    }
    catch {
      // 读取失败按演示环境处理，后端会再校验
    }
  }

  async function finish() {
    await tire.loadMe()
    toast(options.boundToast || '手机号已绑定')
    await options.onBound?.()
  }

  /** 演示环境手动输入绑定 */
  async function bindManual() {
    if (!demoLogin.value) {
      phoneErr.value = '请使用微信手机号快捷绑定'
      return
    }
    const phone = phoneVal.value.trim()
    if (!/^1\d{10}$/.test(phone)) {
      phoneErr.value = '请输入 11 位手机号'
      return
    }
    if (phoneLoading.value)
      return
    phoneLoading.value = true
    phoneErr.value = ''
    try {
      await http.post('/app/auth/phone', { phone }, { silent: true })
      await finish()
    }
    catch (e) {
      phoneErr.value = errText(e, '绑定失败，请稍后重试')
    }
    finally {
      phoneLoading.value = false
    }
  }

  /** 微信手机号快速验证（getPhoneNumber 授权回调） */
  async function onWxPhone(e: WxPhoneEvent) {
    const code = e?.detail?.code
    if (!code) {
      phoneErr.value = '未授权手机号，请重试'
      return
    }
    if (phoneLoading.value)
      return
    phoneLoading.value = true
    phoneErr.value = ''
    try {
      await http.post('/app/auth/phone', { wxPhoneCode: code }, { silent: true })
      await finish()
    }
    catch (err) {
      phoneErr.value = errText(err, '手机号验证失败，请稍后重试')
    }
    finally {
      phoneLoading.value = false
    }
  }

  return { phoneVal, phoneErr, phoneLoading, demoLogin, prepare, bindManual, onWxPhone }
}
