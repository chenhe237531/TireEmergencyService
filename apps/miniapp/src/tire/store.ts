import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http, TOKEN_KEY } from './request'

/** 司机身份字典（与后端 DRIVER_ROLES 一致） */
export const DRIVER_ROLE_NAMES: Record<string, string> = {
  private_owner: '私人车主',
  fleet: '车队',
  store: '服务门店',
}

/** 客户端全局状态：登录态 + 司机资料 */
export const useTire = defineStore('tire', () => {
  const token = ref<string>(uni.getStorageSync(TOKEN_KEY) || '')
  /** 后端 /app/profile 返回的司机资料：{ id, nickname, avatarUrl, phone, role } */
  const me = ref<any>(null)
  const loggedIn = computed(() => !!token.value)
  /** 身份未完善（首次登录未选私人车主/车队/服务门店）需要走完善流程 */
  const roleEmpty = computed(() => !me.value?.role)

  function setToken(t: string) {
    token.value = t
    uni.setStorageSync(TOKEN_KEY, t)
  }

  /** 拉取个人资料；未登录返回 null */
  async function loadMe() {
    if (!token.value) return null
    try {
      me.value = await http.get('/app/profile', undefined, { silent: true })
      return me.value
    }
    catch (e: any) {
      if (e?.code === 40001) logout()
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
