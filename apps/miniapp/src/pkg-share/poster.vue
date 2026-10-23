<script setup lang="ts">
/**
 * 分享海报（pkg-share）
 *
 * 用 canvas 2d 的兼容写法（createCanvasContext）绘制，多端一致：
 *   品牌橙渐变头 → 邀请文案 → 客服二维码（无二维码降级为电话块）→ 底部说明。
 *
 * 平台差异（issue #9）：
 *   - MP-WEIXIN：保存 = canvasToTempFilePath → saveImageToPhotosAlbum（拒绝授权引导 openSetting）；
 *     分享 = 右上角胶囊 / open-type=share 按钮。
 *   - APP-PLUS：保存 = canvasToTempFilePath → saveImageToPhotosAlbum（权限被拒引导系统设置，不循环弹窗）；
 *     分享 = 系统分享面板分享 H5 链接（uni.share provider=system，文案与链接取后台设置）。
 *   - H5：生成后把 canvas 转成图片展示（浏览器里长按可保存），分享 = 复制邀请文案。
 */
import { computed, getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import { http } from '@/tire/request'
import { buildPosterContent, normalizeSettings } from '@/tire/app/settings'
import { openAlbumPermissionSetting, saveImageToAlbum } from '@/tire/app/media'
import type { AlbumSaveResult } from '@/tire/app/media'
import { shareH5ToSystem } from '@/tire/app/share'
import { absUrl, toast } from '@/tire/utils'
import { useShare } from './useShare'

/** 设计稿坐标系：绘制全部按 640×900 计算，再按实际画布尺寸等比缩放 */
const W = 640
const H = 900

const proxy = (getCurrentInstance() as any)?.proxy

useShare({ title: '轮胎出问题，先找小蚂蚁 · 24 小时救援', path: '/pages/index/index' })

const settings = ref<Record<string, string>>({})
const drawing = ref(true)
const drawError = ref('')
/** H5 生成后的图片地址（用于长按保存） */
const previewSrc = ref('')
const ready = ref(false)

/** 海报 / 系统分享共用的内容（标题、链接、完整文案、客服电话）统一由 settings 模块组装 */
const content = computed(() => buildPosterContent(normalizeSettings(settings.value)))
const shareText = computed(() => content.value.title)
const phone = computed(() => content.value.phone)
const qrUrl = computed(() => (settings.value.wechatQr ? absUrl(settings.value.wechatQr) : ''))

onLoad(() => {
  build()
})

/** 画布实际尺寸：拿不到时退回设计尺寸，保证 H5 也不报错 */
function measure(): Promise<{ w: number, h: number }> {
  return new Promise((resolve) => {
    if (!proxy) {
      resolve({ w: W, h: H })
      return
    }
    uni.createSelectorQuery()
      .in(proxy)
      .select('#poster-canvas')
      .boundingClientRect((rect: any) => {
        if (rect?.width)
          resolve({ w: rect.width, h: rect.height })
        else resolve({ w: W, h: H })
      })
      .exec()
  })
}

/** 圆角矩形路径（旧版 canvas API 没有 roundRect） */
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** 按宽度折行，最多 maxLines 行，超出用省略号 */
function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = Array.from(text || '')
  const lines: string[] = []
  let line = ''
  for (const ch of chars) {
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length === maxLines)
        break
    }
    else {
      line = next
    }
  }
  if (lines.length < maxLines && line)
    lines.push(line)
  if (lines.length === maxLines && chars.length && lines.join('').length < chars.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, lines[maxLines - 1].length - 1))}…`
  }
  return lines
}

async function build() {
  drawing.value = true
  drawError.value = ''
  ready.value = false
  previewSrc.value = ''

  try {
    try {
      settings.value = await http.get('/app/settings', undefined, { silent: true })
    }
    catch {
      // 设置拿不到也要能出海报：标题/电话走默认值
    }

    // 二维码先下载成可用路径，失败则降级为电话块
    let qrPath = ''
    if (qrUrl.value) {
      qrPath = await new Promise<string>((resolve) => {
        uni.getImageInfo({
          src: qrUrl.value,
          success: r => resolve(r.path),
          fail: () => resolve(''),
        })
      })
    }

    const size = await measure()
    const ctx = uni.createCanvasContext('poster-canvas', proxy)
    ctx.scale(size.w / W, size.h / H)
    paint(ctx, qrPath)
    await new Promise<void>(resolve => ctx.draw(false, () => setTimeout(resolve, 60)))

    // H5 转成图片展示，浏览器长按即可保存；MP 端保留 canvas 用按钮保存
    // #ifdef H5
    await new Promise<void>((resolve) => {
      uni.canvasToTempFilePath({
        canvasId: 'poster-canvas',
        fileType: 'png',
        success: (r) => {
          previewSrc.value = r.tempFilePath
          resolve()
        },
        fail: () => resolve(),
      } as any, proxy)
    })
    // #endif

    ready.value = true
  }
  catch {
    drawError.value = '海报生成失败，请重试'
  }
  finally {
    drawing.value = false
  }
}

function paint(ctx: any, qrPath: string) {
  // 底色
  ctx.setFillStyle('#F6F5F2')
  ctx.fillRect(0, 0, W, H)

  // 头部渐变
  const grad = ctx.createLinearGradient(0, 0, W, 320)
  grad.addColorStop(0, '#FF8A2A')
  grad.addColorStop(0.6, '#E8721C')
  grad.addColorStop(1, '#C85E0F')
  ctx.setFillStyle(grad)
  ctx.fillRect(0, 0, W, 300)

  // 头部装饰：右侧轮胎环
  ctx.setGlobalAlpha(0.16)
  ctx.setStrokeStyle('#FFFFFF')
  ctx.setLineWidth(22)
  ctx.beginPath()
  ctx.arc(W - 40, 250, 96, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(W - 40, 250, 58, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setGlobalAlpha(1)

  // 品牌名
  ctx.setFillStyle('#FFFFFF')
  ctx.setFontSize(26)
  ctx.setTextAlign('left')
  ctx.fillText('小蚂蚁轮胎救援', 44, 78)

  // 主标题
  ctx.setFontSize(50)
  ctx.fillText('轮胎出问题', 44, 156)
  ctx.fillText('先找小蚂蚁', 44, 218)

  // 副标语
  ctx.setFontSize(24)
  ctx.setGlobalAlpha(0.9)
  ctx.fillText('24 小时轮胎救援 · 平台调度 · 线下服务', 44, 262)
  ctx.setGlobalAlpha(1)

  // 白色内容卡
  ctx.setFillStyle('#FFFFFF')
  roundRect(ctx, 32, 264, W - 64, 480, 28)
  ctx.fill()

  // 邀请文案
  ctx.setFillStyle('#26221D')
  ctx.setFontSize(34)
  const titleLines = wrapText(ctx, shareText.value, W - 144, 2)
  titleLines.forEach((l, i) => ctx.fillText(l, 72, 344 + i * 46))

  // 说明
  ctx.setFillStyle('#8F8981')
  ctx.setFontSize(21)
  const descY = 344 + titleLines.length * 46 + 4
  const descs = wrapText(ctx, '扫码或电话联系平台，就近安排门店上门处理，报价电话确认。', W - 144, 2)
  descs.forEach((l, i) => ctx.fillText(l, 72, descY + i * 32))

  // 分隔细线
  ctx.setStrokeStyle('#EEEAE3')
  ctx.setLineWidth(2)
  ctx.beginPath()
  ctx.moveTo(72, descY + descs.length * 32 + 10)
  ctx.lineTo(W - 72, descY + descs.length * 32 + 10)
  ctx.stroke()

  // 二维码 / 电话
  const blockTop = descY + descs.length * 32 + 46
  if (qrPath) {
    const qrSize = 210
    const qrX = (W - qrSize) / 2
    ctx.setFillStyle('#FFFFFF')
    roundRect(ctx, qrX - 8, blockTop - 8, qrSize + 16, qrSize + 16, 14)
    ctx.fill()
    ctx.drawImage(qrPath, qrX, blockTop, qrSize, qrSize)

    ctx.setFillStyle('#55504A')
    ctx.setFontSize(21)
    ctx.setTextAlign('center')
    ctx.fillText('微信扫码 · 联系平台客服', W / 2, blockTop + qrSize + 42)
    ctx.setTextAlign('left')
  }
  else {
    ctx.setFillStyle('#FDF0E4')
    roundRect(ctx, 72, blockTop, W - 144, 150, 18)
    ctx.fill()

    ctx.setFillStyle('#C85E0F')
    ctx.setFontSize(21)
    ctx.setTextAlign('center')
    ctx.fillText('平台客服电话', W / 2, blockTop + 48)

    ctx.setFillStyle('#26221D')
    ctx.setFontSize(40)
    ctx.fillText(phone.value || '请在平台内咨询', W / 2, blockTop + 102)
    ctx.setTextAlign('left')
  }

  // 底部说明
  ctx.setFillStyle('#A8A199')
  ctx.setFontSize(20)
  ctx.setTextAlign('center')
  ctx.fillText('平台调度 · 线下服务 · 报价透明', W / 2, 812)
  ctx.fillText('长按识别小程序码 / 保存海报分享给车队', W / 2, 848)
  ctx.setTextAlign('left')
}

/** canvas 转临时图片路径（保存相册 / H5 预览共用） */
function canvasToFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvasId: 'poster-canvas',
      fileType: 'png',
      success: r => resolve(r.tempFilePath),
      fail: reject,
    } as any, proxy)
  })
}

/** 相册保存结果 → 用户提示：权限被拒不循环弹窗，只引导一次系统设置 */
function handleAlbumResult(result: AlbumSaveResult) {
  if (result === 'saved') {
    toast('已保存到相册')
    return
  }
  if (result === 'denied') {
    uni.showModal({
      title: '需要相册权限',
      content: '保存海报需要允许访问相册，可在系统设置里开启。',
      confirmText: '去设置',
      success: (m) => {
        if (m.confirm)
          openAlbumPermissionSetting()
      },
    })
    return
  }
  toast('保存失败，请重试')
}

/** 保存到相册：App / 小程序转临时文件后写入相册；H5 提示长按保存 */
async function save() {
  if (!ready.value)
    return
  // #ifdef APP-PLUS || MP-WEIXIN
  try {
    const filePath = await canvasToFile()
    handleAlbumResult(await saveImageToAlbum(filePath))
  }
  catch {
    toast('保存失败，请重试')
  }
  return
  // #endif
  // #ifndef APP-PLUS || MP-WEIXIN
  uni.showModal({
    title: '保存海报',
    content: '在图片上长按，选择「保存图片」即可存入相册。',
    showCancel: false,
    confirmText: '知道了',
  })
  // #endif
}

/** 复制邀请文案（链接 + 说明，任何聊天工具都能识别） */
function copyInvite() {
  uni.setClipboardData({
    data: content.value.message,
    success: () => toast('邀请文案已复制'),
  })
}

/**
 * 分享给好友：
 *   App 拉系统分享面板分享 H5 链接（拉起失败降级复制）；
 *   小程序引导右上角胶囊（保留微信分享链路）；H5 复制邀请文案。
 */
async function share() {
  // #ifdef APP-PLUS
  const r = await shareH5ToSystem({
    title: content.value.title,
    href: content.value.href,
    message: content.value.message,
  })
  if (r === 'shared') {
    toast('已分享')
    return
  }
  if (r === 'canceled')
    return
  copyInvite()
  return
  // #endif
  // #ifdef MP-WEIXIN
  uni.showModal({
    title: '分享给好友',
    content: '点击右上角「···」，选择「发送给朋友」或「分享到朋友圈」。',
    showCancel: false,
    confirmText: '知道了',
  })
  return
  // #endif
  // #ifdef H5
  copyInvite()
  // #endif
}
</script>

<template>
  <view class="t-shell t-shell--plain">
    <view class="poster-hd">
      <view class="text-[19px] text-[#26221D] font-extrabold">
        分享海报
      </view>
      <view class="mt-1 text-[12px] text-[#8F8981] leading-relaxed">
        保存后发到车队群、朋友圈，别人扫码即可联系平台。
      </view>
    </view>

    <view class="t-page-pad">
      <view class="poster-stage">
        <view class="poster-stage__box">
          <!-- 生成中：盖一层，避免看到半张画布 -->
          <view v-if="drawing" class="poster-mask">
            <view class="t-inline-loading__dot !h-6 !w-6" />
            <text class="mt-2 text-[12px] text-[#8F8981]">正在生成海报</text>
          </view>

          <!-- 失败：可重试 -->
          <view v-else-if="drawError" class="poster-mask">
            <TState type="error" title="海报没生成出来" :desc="drawError" action-text="重新生成" @action="build" />
          </view>

          <!-- H5：生成后展示图片，便于长按保存 -->
          <image
            v-if="previewSrc"
            class="poster-img"
            :src="previewSrc"
            mode="widthFix"
            @click="save"
          />
          <canvas
            v-show="!previewSrc"
            id="poster-canvas"
            canvas-id="poster-canvas"
            class="poster-canvas"
          />
        </view>
      </view>

      <view class="mt-4 flex flex-col gap-2.5">
        <TButton block size="lg" icon="i-tabler-download" :disabled="!ready" @click="save">
          保存到相册
        </TButton>
        <TButton block type="soft" size="lg" icon="i-tabler-share" :disabled="!ready" @click="share">
          <!-- #ifdef APP-PLUS -->
          系统分享给好友
          <!-- #endif -->
          <!-- #ifndef APP-PLUS -->
          分享给微信好友
          <!-- #endif -->
        </TButton>
      </view>

      <view class="mt-3 flex items-start gap-1.5 px-1 text-[11px] text-[#A8A199] leading-relaxed">
        <text class="i-tabler-info-circle text-[13px]" />
        <text>海报由平台实时生成，修改「分享文案 / 客服电话 / 二维码」后重新进入本页即可更新。</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.poster-hd {
  padding: 20px 16px 12px;
}

.poster-stage {
  position: relative;
  /* 用 padding 撑出 640×900 的比例（aspect-ratio 在部分小程序基础库上不支持） */
  height: 0;
  padding-bottom: 140.625%;
  overflow: hidden;
  border-radius: 20px;
  background: #fff;
  box-shadow:
    0 2px 6px rgba(38, 34, 29, 0.06),
    0 18px 40px -24px rgba(38, 34, 29, 0.4);
}

.poster-stage__box {
  position: absolute;
  inset: 0;
}

/* 画布铺满容器，绘制时按实际尺寸等比缩放 */
.poster-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.poster-img {
  display: block;
  width: 100%;
}

.poster-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
}
</style>
