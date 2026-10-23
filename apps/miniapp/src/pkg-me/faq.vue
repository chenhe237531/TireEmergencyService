<script setup lang="ts">
/**
 * 常见问题（pkg-me）
 *
 * 折叠面板：一次只展开一条，答案里的 \n 按行渲染（后端多为整段文字）。
 * 三种状态：骨架 / 加载失败重试 / 空。
 */
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http } from '@/tire/request'
import { errText, go } from '@/tire/utils'

interface Faq { id: number, question: string, answer: string }

const faqs = ref<Faq[]>([])
const loading = ref(true)
const errMsg = ref('')
const activeId = ref<number | null>(null)

onLoad(() => load())

async function load() {
  loading.value = true
  errMsg.value = ''
  try {
    const list = await http.get<Faq[]>('/app/faqs', undefined, { silent: true })
    faqs.value = Array.isArray(list) ? list : []
    activeId.value = faqs.value[0]?.id ?? null
  }
  catch (e) {
    errMsg.value = errText(e, '内容没加载出来')
  }
  finally {
    loading.value = false
  }
}

function toggle(id: number) {
  activeId.value = activeId.value === id ? null : id
}

const lines = (answer: string) => String(answer || '').split('\n').filter(l => l.trim() !== '')
</script>

<template>
  <view class="t-shell t-shell--plain">
    <!-- 说明头 -->
    <view class="faq-hd">
      <view class="text-[19px] text-[#26221D] font-extrabold">
        常见问题
      </view>
      <view class="mt-1 text-[12px] text-[#8F8981] leading-relaxed">
        关于下单、上门、收费与售后的高频疑问；没找到答案可以直接联系客服。
      </view>
    </view>

    <view class="t-page-pad mt-3">
      <TSkeleton v-if="loading" variant="text" :rows="6" />

      <view v-else-if="errMsg" class="t-card">
        <TState type="error" title="内容没加载出来" :desc="errMsg" action-text="重新加载" @action="load" />
      </view>

      <view v-else-if="!faqs.length" class="t-card">
        <TState type="empty" title="暂时还没有常见问题" desc="可以直接联系客服，我们会人工解答。" action-text="联系客服" @action="go('/pkg-me/contact')" />
      </view>

      <view v-else class="flex flex-col gap-2.5">
        <view v-for="(f, i) in faqs" :key="f.id" class="t-card faq-item" :class="{ 'is-open': activeId === f.id }">
          <view class="faq-item__q" @click="toggle(f.id)">
            <text class="faq-item__no">{{ String(i + 1).padStart(2, '0') }}</text>
            <text class="faq-item__title">{{ f.question }}</text>
            <text class="faq-item__arrow i-tabler-chevron-down" />
          </view>
          <view v-if="activeId === f.id" class="faq-item__a">
            <view v-for="(l, li) in lines(f.answer)" :key="li" class="faq-item__line">
              {{ l }}
            </view>
          </view>
        </view>

        <view class="t-card mt-1 p-4">
          <view class="flex items-center gap-3">
            <view class="h-10 w-10 flex items-center justify-center rounded-xl bg-[#FDF0E4] text-[20px] text-[#C85E0F]">
              <text class="i-tabler-headset" />
            </view>
            <view class="flex-1">
              <view class="text-[14px] font-semibold">
                还是没解决？
              </view>
              <view class="mt-0.5 text-[12px] text-[#8F8981]">
                客服电话与微信，工作时间内人工响应
              </view>
            </view>
            <text class="i-tabler-chevron-right text-[16px] text-[#C4BDB3]" />
          </view>
          <view class="mt-3">
            <TButton block type="soft" size="md" @click="go('/pkg-me/contact')">
              联系客服
            </TButton>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.faq-hd {
  padding: 20px 16px 4px;
}

.faq-item {
  overflow: hidden;
  transition: box-shadow 0.18s var(--ease-out);
}

.faq-item.is-open {
  box-shadow:
    0 2px 4px rgba(38, 34, 29, 0.05),
    0 14px 30px -18px rgba(38, 34, 29, 0.28);
}

.faq-item__q {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
}

.faq-item__q:active {
  background: #faf8f5;
}

.faq-item__no {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
}

.faq-item__title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink);
}

.faq-item__arrow {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 16px;
  color: #c4bdb3;
  transition: transform 0.2s var(--ease-out);
}

.faq-item.is-open .faq-item__arrow {
  transform: rotate(180deg);
  color: var(--brand);
}

.faq-item__a {
  padding: 0 16px 16px 38px;
  animation: faq-in 0.2s var(--ease-out);
}

.faq-item__line {
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-2);
}

@keyframes faq-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
