<script setup lang="ts">
/**
 * 关于我们（pkg-me）
 *
 * 三段内容用 tab 切换：平台简介 / 用户协议 / 隐私政策。
 * 支持 ?tab=agreement|privacy 直达（登录页的协议链接会带这个参数）。
 * 后台配置了协议外链（userAgreementUrl / privacyPolicyUrl）时，点对应 tab 直接打开链接，
 * 未配置则沿用内置文本；页面底部展示版本号与 App 备案号（issue #9，发布前填入真实备案号）。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TBrand from '@/components/tire/TBrand.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http } from '@/tire/request'
import { getAppVersion } from '@/tire/app/version'
import { icpNumberText, normalizeSettings } from '@/tire/app/settings'
import { toast } from '@/tire/utils'

type TabKey = 'about' | 'agreement' | 'privacy'

const TABS: { key: TabKey, name: string, field: string }[] = [
  { key: 'about', name: '平台简介', field: 'about' },
  { key: 'agreement', name: '用户协议', field: 'userAgreement' },
  { key: 'privacy', name: '隐私政策', field: 'privacyPolicy' },
]

const rawSettings = ref<Record<string, any>>({})
const settings = computed(() => normalizeSettings(rawSettings.value))
const loading = ref(true)
const errMsg = ref('')
const tab = ref<TabKey>('about')

/** 版本号：App 取打包配置，小程序取平台版本，均取不到用兜底 */
const appVersion = getAppVersion()
/** 备案号：后台未配置时展示占位文案 */
const icpText = computed(() => icpNumberText(settings.value.icpNumber))

/** 协议外链（tab 对应的 URL，未配置为空串，走内置文本） */
function tabUrl(key: TabKey): string {
  if (key === 'agreement')
    return settings.value.userAgreementUrl
  if (key === 'privacy')
    return settings.value.privacyPolicyUrl
  return ''
}

const current = computed(() => TABS.find(t => t.key === tab.value)!)
const content = computed(() => settings.value[current.value.field] || '')
/** 后端内容以整段文字存储，按行渲染才能保留换行结构 */
const lines = computed(() => String(content.value).split('\n'))

onLoad((options: any) => {
  const t = options?.tab
  if (t === 'agreement' || t === 'privacy' || t === 'about')
    tab.value = t
  load()
})

async function load() {
  loading.value = true
  errMsg.value = ''
  try {
    rawSettings.value = await http.get('/app/settings', undefined, { silent: true })
  }
  catch (e: any) {
    errMsg.value = e?.message || '内容没加载出来'
  }
  finally {
    loading.value = false
  }
}

/** 打开外部链接：App 用系统浏览器；H5 新开页；小程序无外链能力时复制链接 */
function openExternal(url: string) {
  // #ifdef APP-PLUS
  plus.runtime.openURL(url)
  return
  // #endif
  // #ifdef H5
  window.open(url, '_blank')
  return
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({
    data: url,
    success: () => toast('链接已复制，请在浏览器打开'),
  })
  // #endif
}

function switchTab(key: TabKey) {
  if (tab.value === key)
    return
  const url = tabUrl(key)
  // 配置了协议外链：直接打开链接，不再切内置文本 tab
  if (url) {
    openExternal(url)
    return
  }
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
        版本 {{ appVersion }}
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

      <!-- 平台信息：版本号 / App 备案号（issue #9：备案号发布前由运营在后台填入） -->
      <view class="t-card mt-3 px-4 py-1">
        <view class="about-info__row">
          <text class="about-info__label">版本号</text>
          <text class="about-info__value">{{ appVersion }}</text>
        </view>
        <view class="about-info__row">
          <text class="about-info__label">备案信息</text>
          <text class="about-info__value" :class="{ 'about-info__value--ph': !settings.icpNumber }">{{ icpText }}</text>
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

/* 平台信息行：左标签右值，与 t-card 内的排版一致 */
.about-info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  font-size: 13px;
}

.about-info__row + .about-info__row {
  border-top: 1px solid #eeeae3;
}

.about-info__label {
  color: var(--ink-3);
}

.about-info__value {
  text-align: right;
  word-break: break-all;
  color: var(--ink-2);
}

/* 备案号未配置时的占位文案弱化展示 */
.about-info__value--ph {
  color: #a8a199;
}
</style>
