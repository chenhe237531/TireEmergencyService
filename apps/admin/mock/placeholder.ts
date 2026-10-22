/**
 * mock 占位：本项目已移除全部 mock，接口直连真实后端（vite 代理 /api → localhost:3100）。
 * 保留此文件是为了让 vite-plugin-fake-server 启动不报「mock folder does not exist」。
 * defineMock 由插件在构建期注入，这里仅补类型声明，避免 tsc 报未定义。
 */
declare const defineMock: <T>(data: T) => T

export default defineMock([])
