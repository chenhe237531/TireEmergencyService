/**
 * 全局分享配置（TIRE-M5）
 *
 * 放在基础层而不是分包目录：主包三个 tabbar 页都要引用，
 * 微信小程序里主包不能依赖分包文件，放这里双端都安全。
 *
 * 用法：在页面 `<script setup>` 顶层加一行 `useShare()`，
 * 标题会取后台「分享标题」（/app/settings.shareTitle），拿不到时用默认文案。
 */
import { ref } from 'vue'
import { loadAppSettings } from './settings'

export const DEFAULT_SHARE_TITLE = '小蚂蚁轮胎救援 · 24 小时轮胎救援一键呼叫'
export const DEFAULT_SHARE_PATH = '/pages/index/index'

/** 分享标题（页面模板也可以直接用它做展示） */
export const shareTitle = ref(DEFAULT_SHARE_TITLE)

let loading: Promise<string> | null = null

/** 拉取后台分享标题：失败静默降级为默认文案，不打扰用户 */
export function loadShareTitle(): Promise<string> {
  if (!loading) {
    loading = loadAppSettings()
      .then((s) => {
        if (s.shareTitle)
          shareTitle.value = s.shareTitle
        return shareTitle.value
      })
      .catch(() => DEFAULT_SHARE_TITLE)
  }
  return loading
}

export interface UseShareOptions {
  /** 自定义分享标题 */
  title?: string
  /** 分享落地页，默认首页 */
  path?: string
}

/**
 * 注册页面分享能力。必须在 setup 顶层调用（依赖页面生命周期）。
 */
export function useShare(options: UseShareOptions = {}) {
  loadShareTitle()

  // #ifdef MP-WEIXIN
  const resolveTitle = () => options.title || shareTitle.value || DEFAULT_SHARE_TITLE

  onShareAppMessage(() => ({
    title: resolveTitle(),
    path: options.path || DEFAULT_SHARE_PATH,
  }))

  onShareTimeline(() => ({
    title: resolveTitle(),
  }))
  // #endif

  return { shareTitle, loadShareTitle }
}
