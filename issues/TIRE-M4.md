# TIRE-M4 · 我的（小程序 tabbar 页 + pkg-me 子包）

目标：个人中心入口页 + 资料/FAQ/客服/关于 四个子页。

## 文件所有权
- apps/miniapp/src/pages/me/index.vue（tabbar 页桩已建）
- apps/miniapp/src/pkg-me/profile.vue、faq.vue、contact.vue、about.vue（桩已建）

## 我的页 /pages/me/index
1. 头部资料卡（品牌橙渐变）：头像（me.avatarUrl，空则占位图标）、昵称、手机号（未绑显示「点击绑定」）、身份标签（DRIVER_ROLES，未登录显示「点击登录」→ go('/pkg-auth/login')）
2. 菜单列表（cell 风格）：个人资料 / 分享海报（跳 /pkg-share/poster） / 常见问题 / 联系客服 / 关于我们
3. 已登录显示「退出登录」（底部灰按钮：useTire().logout() → toast → 回首页）

## 子页
- **profile.vue 个人资料**：头像（uni.chooseImage+uploadImage 更新）、昵称、手机号（改绑走 /app/auth/phone）、身份（三选一）；PATCH /app/profile 保存；保存后 useTire().loadMe() 同步全局
- **faq.vue 常见问题**：GET /app/faqs 折叠面板（问题点击展开答案）
- **contact.vue 联系客服**：平台客服电话（settings.servicePhone，大按钮 call()）、客服二维码（settings.wechatQr 有则 image 展示 absUrl()，MP 端长按/点击保存 uni.saveImageToPhotosAlbum——H5 提示长按保存）
- **about.vue 关于我们**：分段内容：平台简介（settings.about）+ 用户协议（userAgreement）+ 隐私政策（privacyPolicy）；支持 ?tab=agreement|privacy 定位滚动（或 tab 切换）；文风排版 \n 换行渲染（split('\n') 循环渲染 view）

## 验收标准
- 未登录访问我的页显示登录引导；登录后资料完整显示
- 改昵称保存后首页/我的同步（loadMe）
- FAQ 可展开；客服电话可拨（H5 tel: 链接）
- about 页三段内容完整渲染换行

## 自测步骤
登录 → 改资料保存 → 刷新仍为新值 → 拨打按钮 → FAQ 展开 → about 查看协议全文
