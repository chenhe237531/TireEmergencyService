<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { getCurrentInstance } from 'vue'
import { navigateToInterceptor } from '@/router/interceptor'
import { permission } from '@/router/permission'
import { useTire } from '@/tire/store'

const { proxy } = (getCurrentInstance() || {}) as any
const router = proxy?.$router
router && permission.install(router)

onLaunch(() => {
  useTire().loadMe()
})
onShow((options: any) => {
  if (options?.path) navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  else navigateToInterceptor.invoke({ url: '/' })
})
</script>

<style lang="scss">
</style>
