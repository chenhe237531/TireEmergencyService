# 雪姬美业 · 六维健康平台（黑客松 MVP）

面向雪姬美业客户（以乐龄女性为主）的健康美学平台：六维测评、免费体检与合作医院转介、个性化门店养护方案、健康档案、会员分级权益与魔镜 AI 陪伴。

- 产品设计：[docs/01_产品设计与开发文档_v1.0（原始稿）.md](docs/01_产品设计与开发文档_v1.0（原始稿）.md)
- 本次迭代、演示指南与部署：[docs/02_产品设计与开发文档_v1.1（黑客松MVP迭代）.md](docs/02_产品设计与开发文档_v1.1（黑客松MVP迭代）.md)

## 门店数据

试点门店为 **雪姬AI智能健康美容体验馆（五月花店）**：门店资料与项目价格取自美团公开团购信息，门店纸质《健康档案表（女）》已数字化为管理端录入表单；鹰眼评估设备在合规审核前不接入。客户真实报告与个人信息不进入代码和演示数据。详见迭代文档第 2 章。

## 组成

| 目录 | 说明 | 框架 |
|---|---|---|
| `apps/miniapp` | 用户端：微信小程序 + H5 演示版 | [unibest](https://github.com/feige996/unibest)（uni-app + Vue3 + TS） |
| `apps/admin` | 管理端 + 医院端 + 顾问移动工作台 | [pure-admin-thin](https://github.com/pure-admin/pure-admin-thin)（Vue3 + Element Plus） |
| `apps/server` | API + 规则引擎 + AI 网关 | NestJS + Prisma（本地 SQLite / 云上 MySQL） |
| `deploy` | 构建、上传脚本，Docker 运行配置 | Docker Compose，可选 Nginx |

## 本地运行

需要 Node.js 20+ 与 pnpm 9+。

```bash
pnpm install
```

```bash
pnpm db:reset
```

```bash
pnpm dev:server
```

```bash
pnpm dev:admin
```

```bash
pnpm dev:h5
```

- API：http://localhost:3000/api/v1
- 管理端 / 医院端：http://localhost:8848（登录页可点击演示账号，密码均为 `123456`）
- 小程序 H5 版：http://localhost:9000（登录页可选择演示客户）
- 微信小程序：`pnpm dev:mp`，用微信开发者工具导入 `apps/miniapp/dist/dev/mp-weixin`

`pnpm db:reset` 会删除并重建本地 SQLite 演示库 `apps/server/prisma/xueji.db`，只用于开发环境。

## 数据库开关：SQLite / MySQL

用环境变量 `DB_PROVIDER` 切换（`apps/server/.env` 或容器环境变量），默认 `sqlite`：

| | 本地开发（默认） | 微信云托管 |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | `mysql` |
| 连接 | `DATABASE_URL=file:./xueji.db` | `DATABASE_URL=mysql://用户:密码@地址:3306/库名`，或直接使用云托管注入的 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`（库名 `MYSQL_DATABASE`，默认 `xueji`） |

- `apps/server/prisma/schema.prisma` 是唯一的数据模型源。MySQL 版 `schema.mysql.prisma` 由 `prisma/db.js` 自动生成（不入库）：替换 provider，并给带 `// mysql: @db.Text` 标记的字段加上 `TEXT` 类型。新增长文本字段（说明、备注、正文、URL 等可能超过 191 个字符的字段）时记得加这个标记。
- 数据库相关命令都经过 `prisma/db.js`，会按开关选 schema；已生成的 Prisma Client 与当前 schema 或开关不一致时自动重新生成：`pnpm --filter xueji-server prisma:generate | db:push | db:seed | db:init | db:reset | db:sync-config`。
- 本地切到 MySQL：在 `apps/server/.env` 写 `DB_PROVIDER=mysql` 和 MySQL 的 `DATABASE_URL`，先 `pnpm --filter xueji-server db:init`（建表，空库时写入演示数据），再 `pnpm dev:server`。
- 容器启动时执行 `db:init`（同步表结构，库为空时写入演示数据）。VPS 镜像（`deploy/Dockerfile`）默认 SQLite；构建参数 `--build-arg DB_PROVIDER=mysql` 预先生成 MySQL 版 Client，也可以只在运行时设置 `DB_PROVIDER=mysql`（启动时多花几秒重新生成）。
- MySQL 需 8.0+，库建议 `CHARACTER SET utf8mb4`。MySQL 默认排序规则不区分大小写，`username` 等唯一字段按不区分大小写比较。

## 部署到 VPS

```bash
deploy/deploy.sh root@<服务器地址>
```

本地构建前端后上传，在 VPS 上用 Docker Compose 构建并运行（`restart: unless-stopped`，开机自启）。部署后访问 `http://<服务器地址>:3000/`（管理端）与 `http://<服务器地址>:3000/h5/`（小程序 H5 版）。详见迭代文档第 9 章。

## 部署到微信云托管

云托管直接从代码仓库构建根目录的 [`Dockerfile`](Dockerfile)（在云端构建 API、管理端和小程序 H5 版，默认连接云托管 MySQL）。VPS 部署用的 `deploy/Dockerfile` 不受影响。

1. **开通 MySQL**：选 MySQL 8.0，管理员用户 `root`，设置强密码。不用手动建库，服务首次启动会自动建库、建表并写入演示数据。
2. **新建服务**，从代码仓库部署：
   - Dockerfile 路径填 `Dockerfile`，目标目录留空（仓库根目录）
   - 端口填 `80`（与镜像内的 `PORT` 一致，填错会被判定为部署失败）
   - 最小实例数建议设为 1：定时任务（预警超时升级等）在进程内运行，缩到 0 时不会执行；冷启动还要同步表结构，耗时较长
3. **服务设置 → 环境变量**：

   | 变量 | 说明 |
   |---|---|
   | `DB_PROVIDER` | `mysql`（镜像默认值，可不填） |
   | `MYSQL_ADDRESS` | MySQL 内网地址，`host:port`，在控制台 MySQL 页面查看 |
   | `MYSQL_USERNAME` / `MYSQL_PASSWORD` | 数据库账号密码（模板部署会自动注入，手动建服务需自己填） |
   | `MYSQL_DATABASE` | 库名，默认 `xueji` |
   | `JWT_SECRET` | **必填**，随机长字符串；不填会使用演示默认密钥，令牌可被伪造 |
   | `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 可选，也可以在管理端"系统管理 - AI 参数"里配置 |

   也可以直接填 `DATABASE_URL=mysql://用户:密码@地址/库名`，优先于上面的 `MYSQL_*`。
4. **访问**：服务的公网访问域名下，`/` 为管理端，`/h5/` 为小程序 H5 版，`/api/v1` 为接口。

不连代码仓库、改用「手动上传代码包」时，用 `deploy/cloudrun-zip.sh` 打包（生成 `deploy/.bundle/xueji-cloudrun.zip`，Dockerfile 在压缩包根目录，已排除 node_modules、dist、本地数据库与 `apps/server/.env`），上传方式选「压缩包」，目标目录留空，Dockerfile 选「有」。

[`container.config.json`](container.config.json) 只在"通过模板部署"时用于生成服务设置初始值，之后修改请到控制台。

### 云托管下的数据与多实例

- **上传文件存数据库**（`UploadFile` 表），访问路径仍是 `/uploads/<文件名>`。容器本地磁盘在重新部署、扩缩容时会丢失，所以不存磁盘；VPS 上早期存在 `data/uploads` 的旧文件继续可访问。
- **多实例安全**：容器启动执行 `db:init` 时用 MySQL `GET_LOCK` 串行，多个实例同时启动不会重复写入演示数据；定时任务里的预警升级用条件更新抢占，不会重复通知。
- 演示副本可见性有 5 秒进程内缓存，多实例时管理端最多延迟几秒显示新的演示访客数据。

### 小程序接入云托管

在 `apps/miniapp/env/.env.production`（或构建时的环境变量）填写：

```
VITE_WX_CLOUD_ENV = '云托管环境 ID'
VITE_WX_CLOUD_SERVICE = '服务名称'
VITE_MP_SERVER_BASEURL = 'https://<服务公网访问域名>/api/v1'
```

- 两个 `VITE_WX_CLOUD_*` 都填写后，小程序接口改走 `wx.cloud.callContainer`（走微信内网，不需要配置 request 合法域名，也不需要备案域名）。需要先在云托管控制台把小程序与云托管环境关联。
- `VITE_MP_SERVER_BASEURL` 用于把 `/uploads/...` 等相对路径图片拼成完整地址（`image` 组件加载网络图片不受合法域名限制）。
- 不填 `VITE_WX_CLOUD_*` 时，仍按 `VITE_MP_SERVER_BASEURL` 发 HTTPS 请求（需备案域名 + 合法域名配置）。H5 版与接口同域部署，不受影响。

## 大模型（可选）

管理端"系统管理 - AI 参数"填写任一 OpenAI 兼容服务（Base URL、模型、API Key）。未配置时，方案文案、魔镜对话等全部使用模板，功能完整可用。
