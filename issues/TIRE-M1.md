# TIRE-M1 · 登录授权 + 全局用户态（小程序）

目标：首次使用的司机完成微信一键登录 → 选身份 → 勾协议 → 进首页；全局登录态可用。

## 文件所有权
- apps/miniapp/src/pkg-auth/login.vue（桩已建）
- apps/miniapp/src/store/ 目录下新建 tire-auth 相关文件如需要（建议不新建，直接用 useTire；若需要临时 UI 态放页面内）

## 功能需求（登录页 /pkg-auth/login）
1. 品牌区：小蚂蚁轮胎救援 标题 + 副标语（如「24小时轮胎救援 · 平台调度 · 线下服务」）+ 品牌橙渐变头图（纯 CSS/UnoCSS 即可，无图片素材）
2. **微信一键登录按钮**（.btn-primary 大按钮）：
   - MP-WEIXIN：uni.login 拿 code → POST /app/auth/login {code}
   - 演示模式说明条：「开发演示模式：同一设备自动保持同一账号」
3. 登录成功后进入**完善流程**（同页分步或弹层）：身份三选一（private_owner 私人车主 / fleet 车队 / store 服务门店，卡片单选）→ 协议勾选（未勾选点登录/下一步 shake 提示「请先阅读并同意协议」；「用户协议」「隐私政策」链接跳 /pkg-me/about?tab=xxx）→ PATCH /app/profile {role}
4. 已有身份的用户（roleEmpty=false）登录后直接 uni.switchTab 回首页（或来源页）
5. 未登录访问受限页：request 层已自动 40001 跳本页，无需重复处理；本页需支持带 redirect 参数回跳（可简化为固定回首页）
6. useTire.setToken 存 token 并 loadMe 刷新全局态

## 验收标准
- H5：访问 http://localhost:9100/#/pkg-auth/login 可完整走完 登录→选身份→勾协议→进首页
- 未勾协议无法进入下一步；身份未选无法完成
- 登录后刷新页面仍保持登录（token 持久化）
- 退出登录入口不在本任务（M4 做）

## 自测步骤
清 localStorage（或换 code）→ 走完整流程 → 二次访问自动登录 → roleEmpty 流程不再出现
