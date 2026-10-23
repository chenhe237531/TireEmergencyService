<script setup lang="ts">
/**
 * 关于我们（pkg-me）
 *
 * 三段内容用 tab 切换：平台简介 / 用户协议 / 隐私政策。
 * 支持 ?tab=agreement|privacy 直达（登录页的协议链接会带这个参数）。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TBrand from '@/components/tire/TBrand.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http } from '@/tire/request'
import type { AppSettings, PageQuery } from '@/tire/types'
import { errText } from '@/tire/utils'

type TabKey = 'about' | 'agreement' | 'privacy'

const TABS: { key: TabKey, name: string, field: string }[] = [
  { key: 'about', name: '平台简介', field: 'about' },
  { key: 'agreement', name: '用户协议', field: 'userAgreement' },
  { key: 'privacy', name: '隐私政策', field: 'privacyPolicy' },
]

const settings = ref<Partial<AppSettings>>({})
const loading = ref(true)
const errMsg = ref('')
const tab = ref<TabKey>('about')

const current = computed(() => TABS.find(t => t.key === tab.value)!)
const content = computed(() => settings.value[current.value.field] || '')
/** 后端内容以整段文字存储，按行渲染才能保留换行结构 */
const lines = computed(() => String(content.value).split('\n'))

onLoad((options: PageQuery = {}) => {
  const t = options?.tab
  if (t === 'agreement' || t === 'privacy' || t === 'about')
    tab.value = t
  load()
})

async function load() {
  loading.value = true
  errMsg.value = ''
  try {
    settings.value = await http.get('/app/settings', undefined, { silent: true })
  }
  catch (e) {
    errMsg.value = errText(e, '内容没加载出来')
  }
  finally {
    loading.value = false
  }
}

function switchTab(key: TabKey) {
  if (tab.value === key)
    return
  tab.value = key
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
</script>

<template>
  <view class="t-shell t-shell--plain">
    <!-- 品牌头 -->
    <view class="about-hd">
      <TBrand size="lg" sub="24 小时轮胎救援 · 平台调度 · 线下服务" />
      <view class="mt-3 text-[12px] text-[#8F8981]">
        版本 1.0.0
      </view>
    </view>

    <!-- 分段 tab -->
    <view class="t-page-pad">
      <view class="about-tabs">
        <view
          v-for="t in TABS"
          :key="t.key"
          class="about-tab"
          :class="{ 'is-active': tab === t.key }"
          @click="switchTab(t.key)"
        >
          {{ t.name }}
        </view>
      </view>
    </view>

    <view class="t-page-pad mt-3">
      <view v-if="loading" class="t-card p-4">
        <TSkeleton variant="text" :rows="8" />
      </view>

      <view v-else-if="errMsg" class="t-card">
        <TState type="error" title="内容没加载出来" :desc="errMsg" action-text="重新加载" @action="load" />
      </view>

      <view v-else-if="!content" class="t-card">
        <TState
          type="empty"
          title="内容还在完善"
          :desc="`${current.name}暂未配置，如有疑问可联系平台客服。`"
          action-text="重新加载"
          @action="load"
        />
      </view>

      <view v-else class="t-card about-body">
        <view class="about-body__title">
          {{ current.name }}
        </view>
        <view class="about-body__meta">
          <text class="i-tabler-file-text text-[12px]" />
          <text>小蚂蚁轮胎救援平台</text>
        </view>
        <view class="mt-3">
          <view v-for="(l, i) in lines" :key="i" class="about-line" :class="{ 'about-line--blank': !l.trim() }">
            {{ l }}
          </view>
        </view>
      </view>

      <view class="py-5 text-center text-[11px] text-[#A8A199] leading-relaxed">
        平台仅提供信息撮合与调度服务
        <br>
        具体施工与收费由合作门店完成
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.about-hd {
  padding: 24px 16px 16px;
  text-align: center;
}

.about-hd .t-brand {
  justify-content: center;
}

.about-tabs {
  display: flex;
  padding: 4px;
  border-radius: 999px;
  background: #efebe4;
}

.about-tab {
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 13px;
  color: var(--ink-2);
  transition:
    background-color 0.18s,
    color 0.18s,
    box-shadow 0.18s;
}

.about-tab.is-active {
  font-weight: 700;
  color: var(--brand-dark);
  background: #fff;
  box-shadow: 0 2px 8px -4px rgba(38, 34, 29, 0.3);
}

.about-body {
  padding: 18px 16px 20px;
}

.about-body__title {
  font-size: 17px;
  font-weight: 800;
  color: var(--ink);
}

.about-body__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-3);
}

.about-line {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-2);
  word-break: break-word;
}

/* 空行只留一点间距，避免协议里连续空行把页面拉太长 */
.about-line--blank {
  height: 6px;
}
</style>
