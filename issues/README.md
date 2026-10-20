# TIRE 多 Agent 并行开发 · 总则（所有任务 Agent 必读）

10 个任务并行开发「小蚂蚁轮胎救援平台」两端页面。主控已完成：monorepo 骨架、后端全部 API、两端路由/页面桩/契约层，并启动了三个常驻服务。你只负责自己任务书列出的文件。

## 常驻服务（已运行，禁止启动/杀掉/重启任何 dev server）
| 服务 | 地址 | 说明 |
|---|---|---|
| 后端 API | http://localhost:3100/api/v1 | NestJS watch 模式，seed 数据已写入 |
| 管理后台 | http://localhost:8850 | Vite 热更新，改文件即生效 |
| 小程序 H5 | http://localhost:9100 | Vite 热更新，改文件即生效 |

后端演示账号：后台 `admin/admin123`（super_admin）、`ops/ops123456`（ops）。小程序端：演示登录（code=deviceId，同设备=同司机）。

## 全局铁律
1. **只允许新建/修改自己任务书「文件所有权」清单内的文件**；其余一律只读。需要改共享文件（api/tire.ts、路由、pages.config、后端等）→ 在最终报告中提出诉求，由主控统一改。
2. 不执行 `pnpm install/add`、不改 package.json/pnpm-lock.yaml、不执行任何 git 命令、不 kill 进程、不改 .env。
3. 后端接口不够用 / 返回结构不合理 → 不要自己改后端，报告里写清诉求。
4. 依赖已全部装好（Element Plus/@pureadmin/table/ECharts/z-paging/UnoCSS 图标集等），直接 import 使用。
5. 注释与 UI 文案用中文；commit 级代码质量（无 console.log 残留、无未用变量）。
6. 完成后必须输出报告：①完成清单 ②自测结果（做了什么验证）③未决事项 ④共享文件改动诉求。

## 验证方式
- admin 任务：改完后浏览器打开 http://localhost:8850（登录 admin/admin123）验证页面与交互；接口可用 `curl http://localhost:8850/api/v1/...` 直连验证。
- miniapp 任务：浏览器打开 http://localhost:9100 验证 H5 表现（微信专属 API 需条件编译兜底，H5 不得白屏/报错）。
- 不要跑全量 lint/build（主控统一跑），但请保证 TS 无类型错误。

## 任务清单
- 后台 5 个：TIRE-A1 工作台 / A2 门店管理 / A3 救援通知+咨询工单 / A4 司机+浏览痕迹 / A5 平台设置+FAQ
- 小程序 5 个：TIRE-M1 登录授权 / M2 首页 / M3 救援咨询表单 / M4 我的 / M5 分享海报+tabbar
