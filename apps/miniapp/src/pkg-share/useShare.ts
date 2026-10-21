/**
 * 分享 composable 的分包入口（TIRE-M5）
 *
 * 实现在 src/tire/share.ts：主包 tabbar 页也要用，而微信小程序主包不能依赖分包文件，
 * 所以本体放基础层；这里保留同目录入口，方便按任务书在分包内引用。
 */
export * from '@/tire/share'
