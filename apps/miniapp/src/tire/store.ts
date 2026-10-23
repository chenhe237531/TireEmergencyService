import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http, TOKEN_KEY } from './request'
import { errCode } from './utils'
import type { DriverProfile } from './types'

/** 司机身份选项（与后端 DRIVER_ROLES 一致）：登录与资料页共用一份 */
export const DRIVER_ROLE_OPTIONS = [
  { value: 'private_owner', label: '私人车主', desc: '小车 / 私家车为主，临时补胎换胎', icon: 'i-tabler-car' },
  { value: 'fleet', label: '车队', desc: '货运车队、工程车队，多车统一调度', icon: 'i-tabler-truck' },
  { value: 'store', label: '服务门店', desc: '轮胎店 / 修理厂，接收平台派单', icon: 'i-tabler-building-store' },
]

export const DRIVER_ROLE_NAMES: Record<string, string> = Object.fromEntries(
  DRIVER_ROLE_OPTIONS.map(o => [o.value, o.label]),
)

/** 客户端全局状态：登录态 + 司机资料 */
export const useTire = defineStore('tire', () => {
  const token = ref<string>(uni.getStorageSync(TOKEN_KEY) || '')
  /** 后端 /app/profile 返回的司机资料 */
  const me = ref<DriverProfile | null>(null)
  const loggedIn = computed(() => !!token.value)
  /** 身份未完善（首次登录未选私人车主/车队/服务门店）需要走完善流程 */
  const roleEmpty = computed(() => !me.value?.role)

  function setToken(t: string) {
    token.value = t
    uni.setStorageSync(TOKEN_KEY, t)
  }

  /** 拉取个人资料；未登录返回 null */
  async function loadMe() {
    if (!token.value)
      return null
    try {
      me.value = await http.get<DriverProfile>('/app/profile', undefined, { silent: true })
      return me.value
    }
    catch (e) {
      if (errCode(e) === 40001)
        logout()
      return null
    }
  }

  function logout() {
    token.value = ''
    me.value = null
    uni.removeStorageSync(TOKEN_KEY)
  }

  return { token, me, loggedIn, roleEmpty, setToken, loadMe, logout }
})
