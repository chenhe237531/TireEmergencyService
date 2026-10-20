# TIRE-M5 · 分享海报 + tabbar 装饰 + 双端适配（小程序）

目标：品牌分享物料与全局装饰收尾。

## 文件所有权
- apps/miniapp/src/pkg-share/poster.vue（桩已建）
- apps/miniapp/src/tabbar/index.vue（仅允许改样式/图标视觉，不改跳转逻辑）
- apps/miniapp/src/static/ 下可新增 tabbar 图标/品牌小图（如需）

## 功能需求
1. **分享海报页 /pkg-share/poster**（入口在「我的」菜单，M4 已跳转）：
   - Canvas 绘制海报（uni.createCanvasContext 或 canvas 2d，注意双端兼容）：品牌橙渐变头（「小蚂蚁轮胎救援」大字 + 副标语「24小时轮胎救援 · 平台调度」）+ 中部邀请文案（settings.shareTitle）+ 底部二维码（settings.wechatQr 有则 drawImage，无则绘制「客服电话 400-xxx」文字块）
   - 生成预览 + 「保存到相册」按钮：MP 端 uni.canvasToTempFilePath → uni.saveImageToPhotosAlbum（授权拒绝引导 openSetting）；H5 端转 dataURL 长按保存提示
   - 「分享给微信好友」按钮：MP 端提示点击右上角胶囊分享（或 open-type="share" 按钮）；H5 端复制邀请文案（uni.setClipboardData）
2. **全局分享配置**：在 pages/index、pages/consult、pages/me 三个 tabbar 页内追加 onShareAppMessage / onShareTimeline（MP-WEIXIN 条件编译，title 用 settings.shareTitle 或默认「小蚂蚁轮胎救援 · 24小时轮胎救援一键呼叫」）——⚠ 这三个页面是 M2/M3/M4 所有，为避免冲突：把分享逻辑写成一个可复用 composable 放本任务目录（如 pkg-share/useShare.ts），并在报告中说明「需要 M2/M3/M4 在页面加一行 useShare()」，由主控集成；不要直接改那三个页面文件
3. **tabbar 视觉**：检查三个 tab（首页/救援咨询/我的）图标与选中态（品牌橙）；可微调 tabbar/index.vue 样式（圆角浮起卡片风/安全区适配），不改 handleClick 等逻辑
4. **双端适配巡检**：H5 运行 http://localhost:9100 全页面无白屏无报错（console 干净）；条件编译正确

## 验收标准
- H5 海报页可生成预览（canvas 渲染成功）并有保存指引；不报错
- useShare composable 导出清晰，主控可一行接入
- tabbar 三项视觉统一、选中品牌橙

## 自测步骤
H5 进「我的→分享海报」→ 生成预览 → 复制文案 → 检查三个 tab 页 console 无错
