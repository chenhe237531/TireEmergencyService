<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { getCurrentInstance } from 'vue'
import { navigateToInterceptor } from '@/router/interceptor'
import { permission } from '@/router/permission'
import { useTire } from '@/tire/store'

// $router 是脚手架注入的属性，类型从 permission.install 的入参推导
const router = (getCurrentInstance()?.proxy as { $router?: Parameters<typeof permission.install>[0] } | undefined)?.$router
router && permission.install(router)

onLaunch(() => {
  const tire = useTire()
  tire.loadMe()
  // 封禁 / 停用等 40003：全局退出，避免页面继续以旧身份展示
  uni.$on('tire:auth-invalid', () => tire.logout())
})
onShow((options: { path?: string, query?: Record<string, string> } = {}) => {
  if (options?.path)
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  else navigateToInterceptor.invoke({ url: '/' })
})
</script>

<style lang="scss">
</style>
