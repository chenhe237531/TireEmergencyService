<script setup lang="ts">
/**
 * 联系客服（pkg-me）
 *
 * 电话优先（司机在路上，打电话最快），二维码作为补充。
 * 拨号：App / 小程序用 uni.makePhoneCall 一键拉起系统拨号，H5 走 tel: 协议；
 * H5 / 小程序里不方便拉起拨号时可复制号码；二维码保存与权限引导统一走 tire/app/media。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import { http } from '@/tire/request'
import { openAlbumPermissionSetting, saveImageToAlbum } from '@/tire/app/media'
import { absUrl, call, toast } from '@/tire/utils'

const settings = ref<Record<string, string>>({})
const loading = ref(true)
const errMsg = ref('')

const phone = computed(() => settings.value.servicePhone || '')
const qr = computed(() => (settings.value.wechatQr ? absUrl(settings.value.wechatQr) : ''))

onLoad(() => load())

async function load() {
  loading.value = true
  errMsg.value = ''
  try {
    settings.value = await http.get('/app/settings', undefined, { silent: true })
  }
  catch (e: any) {
    errMsg.value = e?.message || '客服信息没加载出来'
  }
  finally {
    loading.value = false
  }
}

function onCall() {
  if (!phone.value) {
    toast('客服电话获取中，请稍后再试')
    return
  }
  call(phone.value)
}

/** 复制号码：H5 / 部分小程序环境不能直接拉起拨号时兜底 */
function onCopyPhone() {
  if (!phone.value) {
    toast('客服电话获取中，请稍后再试')
    return
  }
  uni.setClipboardData({
    data: phone.value,
    success: () => toast('客服电话已复制'),
  })
}

function onQrTap() {
  if (!qr.value)
    return
  // #ifdef MP-WEIXIN
  uni.downloadFile({
    url: qr.value,
    success: async (r) => {
      const result = await saveImageToAlbum(r.tempFilePath)
      if (result === 'saved') {
        toast('已保存到相册')
        return
      }
      // 权限被拒不循环弹窗：只引导一次系统设置，由用户自行决定
      if (result === 'denied') {
        uni.showModal({
          title: '需要相册权限',
          content: '保存二维码需要允许访问相册，可在设置里开启。',
          confirmText: '去设置',
          success: (m) => {
            if (m.confirm)
              openAlbumPermissionSetting()
          },
        })
      }
      else {
        toast('保存失败，请长按二维码保存')
      }
    },
    fail: () => toast('保存失败，请长按二维码保存'),
  })
  return
  // #endif
  // #ifndef MP-WEIXIN
  uni.previewImage({ urls: [qr.value], current: qr.value })
  // #endif
}

function onQrLongPress() {
  // 小程序 image 自带「发送给朋友 / 保存图片」菜单；H5 无长按菜单，给文案指引
  // #ifdef H5
  toast('长按图片可保存到相册')
  // #endif
}
</script>

<template>
  <view class="t-shell t-shell--plain">
    <!-- 头部 -->
    <view class="contact-hd">
      <view class="contact-hd__ico">
        <text class="i-tabler-headset" />
      </view>
      <view class="mt-3 text-[19px] text-[#26221D] font-extrabold">
        联系平台客服
      </view>
      <view class="mt-1 text-[12px] text-[#8F8981] leading-relaxed">
        位置、报价、进度都可以问；紧急情况请优先用首页「故障找救援」。
      </view>
    </view>

    <view class="t-page-pad mt-3">
      <TState v-if="loading" type="loading" title="正在获取客服信息" />

      <view v-else-if="errMsg" class="t-card">
        <TState type="error" title="客服信息没加载出来" :desc="errMsg" action-text="重新加载" @action="load" />
      </view>

      <template v-else>
        <!-- 电话 -->
        <view class="t-card p-5">
          <view class="text-[12px] text-[#8F8981]">
            客服电话
          </view>
          <view class="mt-1 flex items-end justify-between gap-3">
            <text class="contact-phone">{{ phone || '暂未配置' }}</text>
            <view class="t-badge">
              24 小时
            </view>
          </view>
          <view class="mt-4">
            <TButton block size="lg" icon="i-tabler-phone-call" :disabled="!phone" @click="onCall">
              {{ phone ? '拨打电话' : '电话暂未配置' }}
            </TButton>
          </view>
          <view v-if="phone" class="mt-3 text-center">
            <text class="contact-copy" @click="onCopyPhone">复制号码</text>
          </view>
          <view class="mt-2 text-center text-[11px] text-[#A8A199]">
            点击后由系统拨号，不会自动外呼
          </view>
        </view>

        <!-- 二维码 -->
        <view class="t-card mt-3 p-5">
          <view class="flex items-center justify-between">
            <view class="text-[14px] font-semibold">
              微信客服
            </view>
            <text class="text-[11px] text-[#A8A199]">{{ qr ? '点击放大 / 保存' : '暂未配置' }}</text>
          </view>

          <view v-if="qr" class="mt-3 flex flex-col items-center">
            <image
              class="contact-qr"
              :src="qr"
              mode="aspectFit"
              @click="onQrTap"
              @longpress="onQrLongPress"
            />
            <view class="mt-2 text-[11px] text-[#A8A199] leading-relaxed">
              长按识别或保存后微信扫一扫
            </view>
          </view>

          <view v-else class="mt-3">
            <view class="t-readout t-readout--muted">
              <text class="i-tabler-qrcode text-[15px]" />
              <text class="flex-1">平台暂未配置客服二维码，请直接拨打电话</text>
            </view>
          </view>
        </view>

        <!-- 说明 -->
        <view class="t-card mt-3 p-4">
          <view class="t-section-title">
            沟通建议
          </view>
          <view class="mt-2 flex flex-col gap-2">
            <view class="contact-note">
              <text class="contact-note__no">1</text>
              <text>说明车型与轮胎规格（如 12R22.5），方便门店带对配件。</text>
            </view>
            <view class="contact-note">
              <text class="contact-note__no">2</text>
              <text>说清所在道路方向与最近出口，夜间尽量描述显眼参照物。</text>
            </view>
            <view class="contact-note">
              <text class="contact-note__no">3</text>
              <text>报价与上门时间由门店在电话里确认，平台不代收费用。</text>
            </view>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<style scoped lang="scss">
.contact-hd {
  padding: 22px 16px 6px;
  text-align: center;
}

.contact-hd__ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 18px;
  font-size: 26px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
  box-shadow: 0 10px 20px -12px rgba(232, 114, 28, 0.8);
}

.contact-phone {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

/* 复制号码：小号可点文本，与主拨号按钮形成主次 */
.contact-copy {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.contact-qr {
  width: 180px;
  height: 180px;
  border-radius: var(--r-inner);
  border: 1px solid var(--line);
  background: #fff;
}

.contact-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-2);
}

.contact-note__no {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-dark);
  background: var(--brand-soft);
}
</style>
