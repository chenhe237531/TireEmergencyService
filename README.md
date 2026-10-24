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
- **我的**：微信授权登录、个人资料与身份（私人车主 / 车队 / 服务门店）、手机号绑定。
- **我的记录**：查看自己的救援 / 咨询进度；待处理或跟进中的救援可主动取消。
- **浏览痕迹**：门店的浏览与点击行为回流后台，用于分析需求分布。

### 运营后台

- **工作台**：今日新增工单、待处理救援、门店数量、司机增长等核心指标。
- **门店管理**：录入门店名称、分类、主营项目、坐标、评分、模糊区域名与排序权重，支持隐藏 / 展示。
- **救援通知**：未读数/超时轮询、状态流转（受状态机约束）、按车型推荐附近门店、指派门店、跟进备注与操作流水。
- **咨询工单**：列表、详情、状态更新、图片与联系方式查看、操作流水。
- **司机管理**：司机列表、身份与状态；超级管理员可封禁 / 解封，封禁后旧令牌立即失效。
- **平台设置**：客服电话、关于我们、用户协议、隐私政策、分享文案等，端上读取同一份配置。
- **常见问题**：FAQ 增删改查与排序。

> 当前进度：后端 API 与数据模型、后台 A1-A5（工作台 / 门店 / 救援通知 / 咨询工单 / 司机与痕迹 / 设置与 FAQ）、小程序 M1-M5（登录 / 首页 / 救援咨询 / 我的 / 分享海报与整体 UI）均已完成并合入 `main`。

## 本地运行

需要 Node.js 20+ 与 pnpm 10+。

```bash
pnpm install
pnpm db:reset     # 建库 + 初始化管理员/设置/FAQ，并写入演示门店与工单
pnpm dev:server   # API：http://localhost:3100/api/v1
pnpm dev:admin    # 后台：http://localhost:8850
pnpm dev:h5       # 小程序 H5 版：http://localhost:9100
```

`db:reset` 会删除并重建本地 SQLite 演示库 `apps/server/prisma/tire.db`，仅用于开发环境。

微信小程序：`pnpm dev:mp`，用微信开发者工具导入 `apps/miniapp/dist/dev/mp-weixin`。

**演示账号（仅 `SEED_DEMO=1` 或本地开发）**

| 端 | 账号 | 说明 |
|---|---|---|
| 后台 | `admin` / `admin123` | 超级管理员（本地开发默认；生产请设置 INITIAL_ADMIN_PASSWORD） |
| 后台 | `ops` / `ops123456` | 平台运营（本地开发默认；生产需显式设置 INITIAL_OPS_PASSWORD） |
| 小程序 | 直接点「演示登录」 | 仅 `ALLOW_DEMO_LOGIN=1` 或本地开发可用；配置微信 AppID 后走真实 `code2Session` |

后端环境变量放在 `apps/server/.env`（可从 `apps/server/.env.example` 复制）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` / `PORT` | SQLite 文件或 MySQL 连接串；API 端口默认 3100 |
| `JWT_SECRET` | **生产必填**；缺失时生产环境直接启动失败，本地开发回退演示密钥 |
| `SEED_DEMO` | `1` 写入演示门店/司机/工单；生产默认 `0`，只初始化管理员、设置、FAQ |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | 首次初始化管理员；不填密码时本地用 `admin123`，生产随机生成并打印一次 |
| `INITIAL_OPS_PASSWORD` | 生产环境创建运营账号时必填；本地演示默认 `ops123456` |
| `WX_APPID` / `WX_SECRET` | 配置后启用真实微信登录与手机号快速验证 |
| `ALLOW_DEMO_LOGIN` | `1` 允许设备标识演示登录；生产默认关闭 |

## 接口约定

统一前缀 `/api/v1`，统一响应包裹：

```json
{ "code": 0, "message": "ok", "data": {} }
```

业务异常同样返回 HTTP 200，用 `code` 区分（`40001` 未登录、`40003` 无权限/账号被封禁、`40010` 需授权、`40011` 需绑定手机号、`40020` 参数错误、`40400` 不存在、`40900` 状态已变化或重复提交）。令牌放在 `Authorization: Bearer <token>`，司机端（`aud=app`）与后台（`aud=admin`）令牌互不通用；账号被封禁/停用后旧令牌在下一次请求即失效。

主要接口：

- 司机端：`POST /app/auth/login`、`POST /app/auth/phone`、`GET|PATCH /app/profile`、`GET /app/stores`、`POST /app/view-log`、`POST /app/rescue-alert`、`GET /app/rescue-alerts`、`PATCH /app/rescue-alerts/:id/cancel`、`GET /app/consults`、`POST /app/consult`、`GET /app/settings`、`GET /app/faqs`、`POST /app/upload`
- 后台：`POST /admin/auth/login`、`POST /admin/auth/password`、`GET /admin/dashboard/stats`、`/admin/stores`、`GET /admin/rescue-alerts`、`GET /admin/rescue-alerts/:id`、`GET /admin/rescue-alerts/:id/nearby-stores`、`PATCH /admin/rescue-alerts/:id`、`/admin/consults`、`GET|PATCH /admin/drivers/:id`、`/admin/view-logs`、`/admin/settings`、`/admin/faqs`（列表 + 增删改，工单类含状态流转与操作流水）

## 数据模型

`apps/server/prisma/schema.prisma` 是唯一的数据模型源，共 10 张表：

| 模型 | 说明 |
|---|---|
| `Staff` | 后台员工，账号密码登录，角色 `super_admin` / `ops` |
| `Driver` | 司机，微信 openid 首次登录自动创建，身份 `private_owner` / `fleet` / `store` |
| `Store` | 门店，6 类分类、坐标、评分、模糊区域名与排序权重，地址与电话不下发端上 |
| `RescueAlert` | 故障找救援工单，含车型/车牌、状态流转、指派门店与时间 |
| `ConsultRequest` | 救援咨询工单，含车辆、位置、描述与现场图片 |
| `TicketLog` | 工单操作流水：状态流转、派单、备注与操作人，支持追溯 |
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
- 本地切 MySQL：在 `apps/server/.env` 写 `DB_PROVIDER=mysql` 和 MySQL 的 `DATABASE_URL`，先 `pnpm --filter tire-server db:init`（建表并按 `SEED_DEMO` 初始化数据），再 `pnpm dev:server`。
- MySQL 需 8.0.13+（TEXT 表达式默认值），库建议 `CHARACTER SET utf8mb4`；默认排序规则不区分大小写，`username`、`openid` 等唯一字段按不区分大小写比较。

## 部署

**手动上传代码包（微信云托管控制台）**：`deploy/cloudrun-zip.sh` 生成 `deploy/.bundle/tire-cloudrun.zip`（约 1 MiB，云托管上传上限 2 MiB，脚本会校验体积）。控制台里「选择方式」选手动上传、「端口」填 `80`、「目标目录」留空、Dockerfile 填 `Dockerfile`；环境变量按 `deploy/cloudrun.env.example` 在首次发布的「高级设置」里填。**云托管 MySQL 单独开通时不会自动注入 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`，必须手填，地址要带端口**；密码含 `% ^ $ *` 等字符时不要手拼 `DATABASE_URL`（未做百分号编码会解析失败），交给 `MYSQL_*` 三个变量拼接。**首次启动会自动建库、建表并写入管理员/设置/FAQ，不需要提前在 MySQL 里建库**；只有账号缺少 `CREATE` 权限时才需要手动执行一次建库语句。

**根目录 `Dockerfile`（云托管 / 通用容器）**：构建 API + 后台 + 小程序 H5，默认 `DB_PROVIDER=mysql`、`PORT=80`。启动时缺库会自动建库（`CREATE DATABASE … utf8mb4`，账号无 `CREATE` 权限时降级为提示手动建库），再同步表结构（多实例用 MySQL `GET_LOCK` 串行）并幂等初始化数据：生产只保证管理员、平台设置与 FAQ；`SEED_DEMO=1` 时才写入演示门店/司机/工单。访问 `/` 为后台、`/h5/` 为小程序 H5 版、`/api/v1` 为接口。`container.config.json` 用于云托管模板部署的初始配置，服务建好后以控制台设置为准。

生产部署必须配置：

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | 是 | 随机长字符串；缺失时容器会直接启动失败 |
| `SMS_CODE_SECRET` | 是 | 短信验证码 HMAC 密钥（`openssl rand -hex 32`）；缺失时容器会直接启动失败 |
| `INITIAL_ADMIN_PASSWORD` | 建议 | 首次初始化管理员密码；不填则随机生成并打印在启动日志中 |
| `INITIAL_OPS_PASSWORD` | 按需 | 需要运营账号时设置；不设置则不会创建 ops |
| `WX_APPID` / `WX_SECRET` | 按需 | 不配置时必须保持 `ALLOW_DEMO_LOGIN=0`，否则只能用于演示 |
| `SEED_DEMO` | 否 | 默认 `0`；演示环境设为 `1` 可写入示例门店/工单 |
| `ALLOW_DEMO_LOGIN` | 否 | 默认 `0`；本地/演示环境设为 `1` 允许设备标识登录 |

构建时如果服务器访问不了 Debian 官方源，可指定国内镜像：

```bash
docker build --build-arg APT_MIRROR=http://mirrors.aliyun.com -t tire-rescue:local .
```

### 从旧版本升级：phone 唯一约束数据迁移（必读）

`Driver.phone` 已改为**可空唯一**（手机号主身份，ADR-0002）。旧库里未绑定手机号的司机 `phone` 是空串，直接部署新版会让启动时的自动建表在创建唯一索引时失败，**容器陷入崩溃循环**。因此升级必须按以下顺序（低峰期执行）：

```bash
# 1. 备份生产数据库
# 2. 数据迁移：空串 → NULL、重复手机号按 ADR-0002 合并账号（事务内，可重复执行，再跑一遍是 no-op）
DB_PROVIDER=mysql DATABASE_URL='mysql://user:pass@host:3306/tire' node prisma/db.js normalize-phones
# 3. 云托管环境变量新增 SMS_CODE_SECRET（见上表，缺失容器起不来）
# 4. 再部署新版本；此后启动的表结构同步变为无差异 no-op
```

**云托管 MySQL 无法从本机直连时的替代路径**：内网地址（10.x）连不上、容器又在崩溃循环没有 shell 时，跳过上面第 2 步，改为在云托管「服务设置 → 环境变量」新增 `TIRE_AUTO_NORMALIZE_PHONES=1` 后**重新部署**——启动 `init` 检测到重复手机号会自动执行同一迁移（空串置 NULL、重复号按 ADR-0002 合并，明细写 `DriverMergeLog`），完成后服务正常起来；**起来后删掉该变量**。迁移会合并账号（不可逆），设变量前务必先在控制台备份数据库。

容器启动（`db.js init`）与手动 `db.js push` 前都有**预检**：发现重复手机号会直接给出上述指引并退出，不会抛出难排查的 Prisma 原始报错。本地 SQLite 开发库若有同样问题，跑一次 `node prisma/db.js normalize-phones` 即可。

**安卓应用内更新清单（`/downloads/android.json`）**：App 端按 `VITE_APP_SERVER_BASEURL` 的域名拼接 `/downloads/android.json` 拉取版本清单（schema 见 TireEmergencyApp 仓 `docs/update-manifest.md`），后端本身不托管该路径——发 APK 时需把清单与 APK 上传到**与 API 同域**的 `/downloads/` 路径（网关 / 对象存储 / 静态目录），并对该路径禁用长缓存。

**`deploy/Dockerfile`（VPS + SQLite）**：前端在本地构建后随部署包上传，镜像内只装 API 依赖；SQLite 数据落在 `/data` 卷，默认端口 3000，以非 root 用户（uid 10001）运行。首次执行 `remote-setup.sh` 会生成随机 `JWT_SECRET` 与初始管理员密码，写入 `tire.env`，默认 `SEED_DEMO=0`、`ALLOW_DEMO_LOGIN=0`；需要演示数据时把 `tire.env` 里的 `SEED_DEMO` 改为 `1`。

一键部署：

```bash
APP_DIR=/opt/tire deploy/deploy.sh root@<服务器地址> [ssh 端口]
```

脚本会本地构建前端 → 打包上传 → 远端 `docker compose up -d --build`。部署后访问 `http://<服务器地址>:3000/`（后台）与 `http://<服务器地址>:3000/h5/`（小程序 H5 版）。初始管理员密码在服务器的 `$APP_DIR/tire.env` 中。

## 小程序接入真实微信登录

在 `apps/miniapp/env/.env`（或构建时环境变量）填写小程序 AppID，并在 `apps/server/.env` 配置 `WX_APPID` / `WX_SECRET` 启用 `code2Session` 与手机号快速验证。未配置微信凭据时，只有 `ALLOW_DEMO_LOGIN=1`（本地默认开启）才允许设备标识演示登录；生产环境默认拒绝，避免任何人都能伪造司机身份。

- 小程序接口地址：`VITE_MP_SERVER_BASEURL`，生产环境需 HTTPS 且在微信后台配置 request 合法域名。
- H5 版与接口同域部署，走相对路径，不受合法域名限制。
- 真机预览时把接口地址改为电脑局域网 IP，手机需与电脑在同一 Wi-Fi。
