<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { getCurrentInstance } from 'vue'
import { navigateToInterceptor } from '@/router/interceptor'
import { permission } from '@/router/permission'
import { setRecordsAppVisible, setRecordsBackgroundPolling } from '@/tire/app/recordsPoll'
import { setAppForeground } from '@/tire/app/notify'
import { useTire } from '@/tire/store'

const { proxy } = (getCurrentInstance() || {}) as any
const router = proxy?.$router
router && permission.install(router)

onLaunch(() => {
  const tire = useTire()
  tire.loadMe()
  // 封禁 / 停用等 40003：全局退出，避免页面继续以旧身份展示
  uni.$on('tire:auth-invalid', () => tire.logout())
})
onShow((options: any) => {
  // App 回前台：状态变化提示走前台 toast，轮询交还页面持有方
  setAppForeground(true)
  setRecordsAppVisible(true)
  setRecordsBackgroundPolling(false)
  if (options?.path)
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  else navigateToInterceptor.invoke({ url: '/' })
})
onHide(() => {
  // App 退后台：标记非前台（状态变化转本地通知）并整体暂停前台轮询；
  // App 端进程存活时由后台轮询接管（仅 APP-PLUS），H5 / 小程序随之停止
  setAppForeground(false)
  setRecordsAppVisible(false)
  setRecordsBackgroundPolling(true)
})
</script>

<style lang="scss">
</style>
