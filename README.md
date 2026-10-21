# 小蚂蚁 · 轮胎紧急救援与维修服务平台

面向货车、轿车司机的轮胎应急救援平台：司机在小程序里提交救援或咨询需求，平台客服第一时间电话联系，协调附近的轮胎店、修理厂、救援车队线下补胎换胎与拖车。**平台只做信息对接与人工调度，不参与线上交易**，服务费用由司机与门店现场确认、线下支付。

## 业务闭环

```
司机提交需求（故障找救援 / 救援咨询）
        ↓
平台客服收到通知，电话核实故障与位置
        ↓
客服协调就近合作门店（大车轮胎 / 小车轮胎 / 修理厂 / 拖车）
        ↓
门店线下服务，司机与门店现场确认价格并结算
        ↓
后台更新工单状态：待处理 → 跟进中 → 已解决 / 已取消
```

门店的电话与详细地址只在后台可见，端上仅展示门店名称、分类、主营项目、评分和模糊区域（如「郑东新区 · 距您 1.5km」），由客服统一对接，避免信息泄露和随意报价。

## 组成

| 目录 | 说明 | 技术栈 |
|---|---|---|
| `apps/miniapp` | 司机端：微信小程序 + H5 演示版 | [unibest](https://github.com/feige996/unibest)（uni-app + Vue3 + TS + UnoCSS） |
| `apps/admin` | 平台运营后台：工作台、门店、救援通知、咨询工单、司机、浏览痕迹、平台设置、FAQ | [pure-admin-thin](https://github.com/pure-admin/pure-admin-thin)（Vue3 + Element Plus + ECharts） |
| `apps/server` | API + 业务规则 + JWT 鉴权，同时托管前端静态资源 | NestJS 11 + Prisma 6 |
| `deploy` | 构建、上传、运行脚本，Docker Compose 与 Nginx 配置 | Docker / Shell |
| `issues` | 前后端任务的拆分与验收说明（多 Agent 并行开发用） | Markdown |

## 功能

### 司机端（小程序）

- **首页**：附近门店列表，支持按距离排序，覆盖 6 个分类——大车轮胎店、小车轮胎店、轮胎店（大小车）、大车修理厂、小车修理厂、救援拖车。
- **故障找救援**：一键上报当前位置与故障情况，后台实时弹窗提醒并计入未读。
- **救援咨询**：填写车牌、车型、位置、故障描述、现场照片与联系人，提交后由客服跟进。
- **我的**：微信授权登录（同设备演示登录）、个人资料与身份（私人车主 / 车队 / 服务门店）。
- **浏览痕迹**：门店的浏览与点击行为回流后台，用于分析需求分布。

### 运营后台

- **工作台**：今日新增工单、待处理救援、门店数量、司机增长等核心指标。
- **门店管理**：录入门店名称、分类、主营项目、坐标、评分、模糊区域名与排序权重，支持隐藏 / 展示。
- **救援通知**：未读数轮询、状态流转（受状态机约束，防止随意跳转）、跟进备注与处理人记录。
- **咨询工单**：列表、详情、状态更新，图片与联系方式查看。
- **司机管理**：司机列表、身份与状态（正常 / 封禁）。
- **平台设置**：客服电话、关于我们、用户协议、隐私政策、分享文案等，端上读取同一份配置。
- **常见问题**：FAQ 增删改查与排序。

> 当前进度：后端 API 与数据模型、后台 A1-A5（工作台 / 门店 / 救援通知 / 咨询工单 / 司机与痕迹 / 设置与 FAQ）、小程序 M1-M5（登录 / 首页 / 救援咨询 / 我的 / 分享海报与整体 UI）均已完成并合入 `main`。

## 本地运行

需要 Node.js 20+ 与 pnpm 10+。

```bash
pnpm install
pnpm db:reset     # 建库 + 写入演示数据（管理员、10 家门店、演示工单、FAQ、平台设置）
pnpm dev:server   # API：http://localhost:3100/api/v1
pnpm dev:admin    # 后台：http://localhost:8850
pnpm dev:h5       # 小程序 H5 版：http://localhost:9100
```

微信小程序：`pnpm dev:mp`，用微信开发者工具导入 `apps/miniapp/dist/dev/mp-weixin`。

**演示账号**

| 端 | 账号 | 说明 |
|---|---|---|
| 后台 | `admin` / `admin123` | 超级管理员 |
| 后台 | `ops` / `ops123456` | 平台运营 |
| 小程序 | 直接点「演示登录」 | 同一设备标识对应同一司机；配置微信 AppID 后走真实 `code2Session` |

后端环境变量放在 `apps/server/.env`（可从 `apps/server/.env.example` 复制）：`DATABASE_URL`、`PORT`（默认 3100）、`JWT_SECRET`、可选的 `WX_APPID` / `WX_SECRET`。生产环境务必设置随机 `JWT_SECRET`，否则会退回演示默认密钥。

`pnpm db:reset` 会删除并重建本地 SQLite 演示库 `apps/server/prisma/tire.db`，仅用于开发环境。

## 接口约定

统一前缀 `/api/v1`，统一响应包裹：

```json
{ "code": 0, "message": "ok", "data": {} }
```

业务异常同样返回 HTTP 200，用 `code` 区分（`40001` 未登录、`40003` 无权限、`40010` 需授权、`40011` 需绑定手机号、`40020` 参数错误、`40400` 不存在、`40900` 状态已变化）。令牌放在 `Authorization: Bearer <token>`，司机端（`aud=app`）与后台（`aud=admin`）令牌互不通用。

主要接口：

- 司机端：`POST /auth/login`、`POST /auth/phone`、`GET|PATCH /profile`、`GET /stores`、`POST /view-log`、`POST /rescue-alert`、`POST /consult`、`GET /settings`、`GET /faqs`、`POST /upload`
- 后台：`POST /admin/auth/login`、`GET /admin/dashboard/stats`、`/admin/stores`、`/admin/rescue-alerts`、`/admin/consults`、`/admin/drivers`、`/admin/view-logs`、`/admin/settings`、`/admin/faqs`（列表 + 增删改，工单类含状态流转接口）

## 数据模型

`apps/server/prisma/schema.prisma` 是唯一的数据模型源，共 9 张表：

| 模型 | 说明 |
|---|---|
| `Staff` | 后台员工，账号密码登录，角色 `super_admin` / `ops` |
| `Driver` | 司机，微信 openid 首次登录自动创建，身份 `private_owner` / `fleet` / `store` |
| `Store` | 门店，6 类分类、坐标、评分、模糊区域名与排序权重，地址与电话不下发端上 |
| `RescueAlert` | 故障找救援工单，状态 `pending` → `contacting` → `resolved` / `cancelled` |
| `ConsultRequest` | 救援咨询工单，含车辆、位置、描述与现场图片 |
| `ViewLog` | 门店浏览 / 点击痕迹 |
| `Faq` | 常见问题与排序 |
| `Setting` | 平台配置（客服电话、关于我们、协议、分享文案） |
| `UploadFile` | 上传文件存数据库，访问路径 `/uploads/<文件名>` |

## 数据库：SQLite / MySQL

用环境变量 `DB_PROVIDER` 切换，默认 `sqlite`：

| | 本地开发（默认） | 容器 / 云托管 |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | `mysql` |
| 连接 | `DATABASE_URL=file:./tire.db` | `DATABASE_URL=mysql://用户:密码@地址:3306/库名`，或使用 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`（库名 `MYSQL_DATABASE`，默认 `tire`） |

- MySQL 版 `schema.mysql.prisma` 由 `prisma/db.js` 自动生成（不入库）：替换 provider，并给带 `// mysql: @db.Text` 标记的字段补上 `TEXT`。新增长文本字段（描述、备注、协议正文、URL 等可能超过 191 字符的字段）时记得加这个标记。
- 数据库命令统一走 `prisma/db.js`，会按开关选 schema，并在 Prisma Client 与当前 schema 不一致时自动重新生成：`pnpm --filter tire-server prisma:generate | db:push | db:seed | db:init | db:reset`。
- 本地切 MySQL：在 `apps/server/.env` 写 `DB_PROVIDER=mysql` 和 MySQL 的 `DATABASE_URL`，先 `pnpm --filter tire-server db:init`（建表，空库写入演示数据），再 `pnpm dev:server`。
- MySQL 需 8.0+，库建议 `CHARACTER SET utf8mb4`；默认排序规则不区分大小写，`username`、`openid` 等唯一字段按不区分大小写比较。

## 部署

**根目录 `Dockerfile`（云托管 / 通用容器）**：构建 API + 后台 + 小程序 H5，默认 `DB_PROVIDER=mysql`、`PORT=80`。启动时先同步表结构（多实例用 MySQL `GET_LOCK` 串行），库为空时写入演示数据，再拉起 API。访问 `/` 为后台、`/h5/` 为小程序 H5 版、`/api/v1` 为接口。`container.config.json` 用于云托管模板部署的初始配置，服务建好后以控制台设置为准。

**`deploy/Dockerfile`（VPS + SQLite）**：前端在本地构建后随部署包上传，镜像内只装 API 依赖；SQLite 数据落在 `/data` 卷，默认端口 3000，以非 root 用户（uid 10001）运行。

一键部署：

```bash
APP_DIR=/opt/tire deploy/deploy.sh root@<服务器地址> [ssh 端口]
```

脚本会本地构建前端 → 打包上传 → 远端 `docker compose up -d --build`。部署后访问 `http://<服务器地址>:3000/`（后台）与 `http://<服务器地址>:3000/h5/`（小程序 H5 版）。

> 注意：`deploy/` 下的脚本与根 `Dockerfile` 里的包名、镜像名、数据库文件名仍沿用项目初始化时的旧命名，首次部署前请统一改为 `tire-*` / `tire.db`，避免 `pnpm --filter` 找不到包。

## 小程序接入真实微信登录

在 `apps/miniapp/env/.env`（或构建时环境变量）填写小程序 AppID，并在 `apps/server/.env` 配置 `WX_APPID` / `WX_SECRET` 启用 `code2Session`；不配置时使用演示登录（`code` 即设备标识），便于本地联调。

- 小程序接口地址：`VITE_MP_SERVER_BASEURL`，生产环境需 HTTPS 且在微信后台配置 request 合法域名。
- H5 版与接口同域部署，走相对路径，不受合法域名限制。
- 真机预览时把接口地址改为电脑局域网 IP，手机需与电脑在同一 Wi-Fi。
