<script setup lang="ts">
/**
 * 首次启动隐私弹窗（仅 APP-PLUS 挂载）。
 *
 * 未同意前不初始化高德定位 / 地图等第三方 SDK；
 * 协议正文复用后台 /app/settings 的 userAgreement / privacyPolicy。
 */
import { computed, ref } from 'vue'
import { http } from '@/tire/request'
import { acceptPrivacy } from '@/tire/app/privacy'
import TBrand from './TBrand.vue'
import TButton from './TButton.vue'
import TSheet from './TSheet.vue'

const emit = defineEmits<{ (e: 'agree'): void }>()

const docShow = ref(false)
const docTab = ref<'agreement' | 'privacy'>('agreement')
const docContent = ref('')
const docLoading = ref(false)
const docError = ref('')
const settings = ref<Record<string, string> | null>(null)

const docTitle = computed(() => (docTab.value === 'agreement' ? '用户协议' : '隐私政策'))
const docLines = computed(() => docContent.value.split('\n'))

async function loadSettings() {
  if (settings.value)
    return settings.value
  settings.value = await http.get<Record<string, string>>('/app/settings', undefined, { silent: true })
  return settings.value
}

async function openDoc(tab: 'agreement' | 'privacy') {
  docTab.value = tab
  docShow.value = true
  docLoading.value = true
  docError.value = ''
  try {
    const data = await loadSettings()
    docContent.value = data?.[tab === 'agreement' ? 'userAgreement' : 'privacyPolicy'] || ''
  }
  catch (e: any) {
    docError.value = e?.message && e.message !== 'network' ? e.message : '协议内容没加载出来，请检查网络后重试'
  }
  finally {
    docLoading.value = false
  }
}

function retryDoc() {
  settings.value = null
  openDoc(docTab.value)
}

function agree() {
  acceptPrivacy()
  emit('agree')
}

function deny() {
  uni.showToast({ title: '需同意协议后才能使用', icon: 'none' })
}
</script>

<template>
  <view class="privacy" @touchmove.stop.prevent>
    <view class="privacy__card">
      <TBrand size="md" sub="24 小时轮胎救援 · 平台调度 · 线下服务" />

      <view class="privacy__title">
        欢迎使用小蚂蚁轮胎救援
      </view>
      <view class="privacy__desc">
        使用前请阅读并同意
        <text class="privacy__link" @click="openDoc('agreement')">《用户协议》</text>
        和
        <text class="privacy__link" @click="openDoc('privacy')">《隐私政策》</text>
        。我们只在提供救援服务所必需的范围内收集信息。
      </view>

      <view class="privacy__list">
        <view class="privacy__item">
          <text class="privacy__ico i-tabler-map-pin" />
          <text>定位用于展示附近门店与地图选点，拒绝后仍可手填位置</text>
        </view>
        <view class="privacy__item">
          <text class="privacy__ico i-tabler-camera" />
          <text>相机与相册仅在您主动上传现场照片时使用</text>
        </view>
        <view class="privacy__item">
          <text class="privacy__ico i-tabler-shield-check" />
          <text>高德地图等第三方 SDK 仅在您同意后初始化</text>
        </view>
      </view>

      <view class="privacy__actions">
        <TButton block size="lg" @click="agree">
          同意并继续
        </TButton>
        <view class="privacy__deny" @click="deny">
          暂不同意
        </view>
      </view>
    </view>
  </view>

  <TSheet
    v-model:show="docShow"
    :title="docTitle"
    hide-cancel
    confirm-text="我知道了"
    @confirm="docShow = false"
  >
    <view v-if="docLoading" class="privacy__doc-hint">
      正在加载协议内容…
    </view>
    <view v-else-if="docError" class="privacy__doc-hint">
      <view>{{ docError }}</view>
      <text class="privacy__link mt-2" @click="retryDoc">重新加载</text>
    </view>
    <scroll-view v-else scroll-y class="privacy__doc-scroll">
      <view
        v-for="(line, i) in docLines"
        :key="i"
        class="privacy__doc-line"
        :class="{ 'privacy__doc-line--blank': !line.trim() }"
      >
        {{ line }}
      </view>
    </scroll-view>
  </TSheet>
</template>

<style scoped lang="scss">
.privacy {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(30, 27, 24, 0.55);
}

.privacy__card {
  width: 100%;
  max-width: 360px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 22px 20px 18px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 48px -20px rgba(38, 34, 29, 0.5);
}

.privacy__title {
  margin-top: 18px;
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
}

.privacy__desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
}

.privacy__link {
  color: var(--brand-dark);
  font-weight: 600;
}

.privacy__list {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--brand-soft);
}

.privacy__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-2);
}

.privacy__item + .privacy__item {
  margin-top: 6px;
}

.privacy__ico {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 14px;
  color: var(--brand-dark);
}

.privacy__actions {
  margin-top: 18px;
}

.privacy__deny {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
}

.privacy__doc-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  font-size: 13px;
  color: var(--ink-3);
}

.privacy__doc-scroll {
  height: 45vh;
}

.privacy__doc-line {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-2);
  word-break: break-word;
}

.privacy__doc-line--blank {
  height: 6px;
}
</style>
