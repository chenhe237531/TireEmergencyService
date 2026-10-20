/**
 * 雪姬美业 · 开发任务 Issue 生成器
 *
 * 依据 docs/06 ~ docs/09 四份设计文档，把优化方案拆成可被 AI Agent 独立认领的 Issue。
 * 唯一数据源是本文件的 ISSUES 数组；运行后生成：
 *   issues/<ID>.md      单张 Issue 卡片（YAML frontmatter + 正文）
 *   issues/BOARD.md     波次看板与依赖
 *   issues/OWNERSHIP.md 文件独占表（多 Agent 并行防冲突）
 *   issues/README.md    Agent 认领协议
 *   issues/DECISIONS.md 决策门
 *   issues/issues.json  机器可读索引
 *
 * 状态台账：`scripts/issue-status.json`（status / assignee / note）。
 * 生成物里的 status 是台账的投影，**手改生成物会被覆盖**。
 *
 * 用法：
 *   node scripts/gen-issues.mjs                    # 重新生成 Issue 包
 *   node scripts/gen-issues.mjs --check            # 校验依赖 / 独占 / 决策一致性
 *   node scripts/gen-issues.mjs --next             # 打印下一个可认领的 Issue（供流水线用）
 *   node scripts/gen-issues.mjs --claim <ID> <名>   # 认领并把状态置 claimed
 *   node scripts/gen-issues.mjs --set-status <ID> <状态> [名]   # 置 ready/claimed/in_review/done
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'issues')

const M = 'apps/miniapp/src'

/**
 * 状态台账：`status` / `assignee` 不写在生成物里（会被下次生成覆盖），
 * 统一存放在 scripts/issue-status.json，由本脚本读写并合并进 Issue 卡片。
 */
const LEDGER_FILE = join(ROOT, 'scripts/issue-status.json')
let LEDGER = { entries: {} }
try {
  if (existsSync(LEDGER_FILE))
    LEDGER = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'))
}
catch (e) {
  console.error(`⚠️  scripts/issue-status.json 解析失败，按空台账处理：${e.message}`)
}
LEDGER.entries ||= {}

async function saveLedger() {
  await writeFile(LEDGER_FILE, `${JSON.stringify(LEDGER, null, 2)}\n`, 'utf8')
}

const ledgerOf = id => LEDGER.entries[id] || {}
/** 台账优先，其次数据源里的静态默认值，最后兜底 ready */
const effStatus = i => ledgerOf(i.id).status || i.status || 'ready'
const effAssignee = i => (ledgerOf(i.id).assignee !== undefined ? ledgerOf(i.id).assignee : (i.assignee ?? null))

const STATUSES = ['ready', 'claimed', 'in_review', 'done']
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }

/** Agent 角色：ds=设计系统 / fe=前端页面 / be=后端服务 / infra=工程基建 / qa=质量验收 / pm=产品决策 */
const AGENTS = {
  ds: ['设计系统 Agent', '令牌、公共组件、样式底座。产出物必须被多个页面复用，不写业务请求。'],
  fe: ['前端页面 Agent', '页面与业务组件。只消费 ds 产出的组件与令牌，不新增全局令牌。'],
  be: ['后端服务 Agent', 'NestJS 控制器 + Prisma 模型 + 服务层。接口契约先行，前端按契约并行。'],
  infra: ['工程基建 Agent', '构建、校验、CI、沙箱适配。所有 Agent 的公共依赖，工期最短、优先级最高。'],
  qa: ['质量验收 Agent', '真机性能、无障碍、视觉回归。只出报告与阻断结论，不改业务代码。'],
  pm: ['产品决策 Agent', '维护 Issue 包与决策门，裁定冲突，不写代码。'],
}

const WAVES = {
  W0: ['W0 · 决策门', '21 项决议已全部定稿，**无待定项**；下游直接按决议执行。'],
  W1: ['W1 · 地基', '设计令牌、公共组件、工程基建、路由预登记。所有后续波次的前置。'],
  W2: ['W2 · 主 Tab 体验', '四个主 Tab 的视觉与互动升级，用户感知最直接的一波。'],
  W3: ['W3 · 后端数据与服务', '三张新表 + 10 个接口。与 W2 并行，前端按契约先做。'],
  W4: ['W4 · 互动玩法', '六个新玩法页面，依赖 W3 的接口落地。'],
  W5: ['W5 · 成长体系', '「我的」页成长可视化，依赖徽章接口。'],
  W6: ['W6 · 图形资源', '图形补齐、图标枚举固定、死资源回收。'],
  W7: ['W7 · 内部页面动态化', '按模块分组的批量动效与视觉升级，可高度并行。'],
  W8: ['W8 · 质量验收', '性能、无障碍、视觉回归三道闸门，最后一道放行。'],
}

/**
 * 字段说明：
 *   deps      前置 Issue（必须已合并）
 *   blocks    由 deps 反推自动生成，不手写
 *   decisions 关联决策编号（见 DECISIONS）
 *   filesOwn  本 Issue 独占可写文件（其他 Agent 不得改）
 *   filesRead 只读参考文件
 */
const ISSUES = [
  /* ───────────────────────── W0 决策门 ───────────────────────── */
  {
    id: 'XJ-000',
    title: '决策门：21 项决议定稿（已完成）',
    wave: 'W0',
    agent: 'pm',
    priority: 'P0',
    size: 'S',
    status: 'done',
    assignee: 'pm-agent',
    deps: [],
    decisions: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'],
    filesOwn: ['issues/DECISIONS.md', 'issues/issues.json'],
    filesRead: ['docs/06_小程序视觉优化方案_v2.0（互动化改版提案）.md', 'docs/07_小程序互动化改版设计规格_v2.1.md', 'docs/08_小程序动效与视觉细节规范_v2.2.md', 'docs/09_小程序图形资源替换说明_v2.3.md'],
    value: '把散落在四份设计文档里的决策事项收敛成一张**已定稿**的决议表，让任何 Agent 直接执行，不存在「等拍板」「按默认值假设」的中间态。',
    bg: [
      '四份设计文档曾遗留决策事项：`docs/06` 5 项、`docs/07` 7 项、`docs/08` 6 项、`docs/09` 5 项，去重后为 18 项。',
      '这些事项若不收敛，相关 Issue 会互相等待，多 Agent 并行开发会卡在等决策上。',
      '本轮用户已明确要求「按建议执行、不留待定项」，因此 18 项全部采纳推荐值定稿，并追加 `docs/06 §7` 遗留的 3 项（小镜形象 / 趋势结论字段 / 悬浮球去留），合计 21 项。',
    ],
    scope: [
      '把决策事项整理为 `D1`~`D21`，逐项写明：事项、**最终决议**、影响哪些 Issue、**决议理由**（供 Agent 在边界情况自行裁量）。',
      '全部标记为「✅ 已定」，**不保留任何待定状态**；`issues.json` 的 `decisionSummary` 输出 `{ total: 21, decided: 21, pending: 0 }`。',
      '在 `docs/06` ~ `docs/10` 的对应章节同步标注「已定稿」并指向 `issues/DECISIONS.md`，消除文档间的口径差。',
      '把决议编号回填到各 Issue 的 `decisions` 字段，使 Agent 认领时能直接看到约束自己的决议。',
    ],
    ac: [
      '`DECISIONS.md` 中 `D1`~`D21` 每项都有「最终决议」「影响的 Issue ID」「决议理由」，状态列全部为「✅ 已定」。',
      '`issues.json` 的 `decisionSummary.pending` 为 `0`，且 `decisions[]` 每项 `status` 均为 `decided`。',
      '`docs/06` ~ `docs/10` 中原「待确认事项」章节均已改写为「决策事项（已定稿）」表格；仓库内不再存在**等待用户决策**的表述（`docs/01` 原始稿存档、`docs/02 §10` 客户侧待提供材料除外）。',
      '各 Issue 的 `decisions` 字段与本表「影响 Issue」列双向一致。',
    ],
    dont: [
      '不要因此阻塞其他 Issue 开工——决议已定稿，直接执行即可。',
      '不要手改 `issues/DECISIONS.md`（生成物）；变更只能改 `scripts/gen-issues.mjs` 的 `DECISIONS` 数组后重新生成。',
    ],
    refs: ['docs/06 §7', 'docs/07 §10', 'docs/08 §10', 'docs/09 §9', 'docs/10 §8'],
  },

  /* ───────────────────────── W1 地基 ───────────────────────── */
  {
    id: 'XJ-101',
    title: '工程基建：构建与校验脚本化、CI 入口',
    wave: 'W1',
    agent: 'infra',
    priority: 'P0',
    size: 'S',
    deps: [],
    decisions: [],
    filesOwn: ['package.json', 'apps/miniapp/package.json', 'scripts/ci-check.sh'],
    filesRead: ['apps/miniapp/uno.config.ts'],
    value: '把所有 Agent 的验收动作压成一条命令，让「改了没坏」可以被机器判定，而不是靠人肉回忆。',
    bg: [
      '当前仓库没有 CI，没有任何统一校验入口；`uni build -p mp-weixin` 在沙箱内会因 `[safe-delete] broker denied delete: src/pages.json.lock` 失败，与代码无关，但每次都要人工判断。',
      '`apps/miniapp` 既有的 ESLint 告警有 30 余处（如 `xj/store.ts` 的 if 大括号、`HomeRender.vue` 的行长），若无基线，Agent 无法区分「我引入的问题」和「既有问题」。',
      '本项目产物校验有特殊要求：动效类是否进 `app.wxss`、彩色图形是否走 bg 模式、新组件是否注册进 `usingComponents`——这些必须脚本化，否则每个 Agent 都要重复摸索。',
    ],
    scope: [
      '根 `package.json` 增加 `check:mp` 脚本，串起「改动文件 lint → 构建 → 产物断言」。',
      '`apps/miniapp/package.json` 增加 `lint`（全量，允许既有告警）与 `lint:changed`（只查 git 改动文件，零告警才通过）。',
      '记录既有 lint 告警基线到 `scripts/lint-baseline.txt`，`ci-check.sh` 对比基线，新增告警视为失败。',
      '新增 `scripts/ci-check.sh`：接收文件列表参数，输出三段结果（lint / build / 产物断言），退出码可用于门禁。',
      '产物断言脚本检查：`app.wxss` 是否含 `mo-` 与 `gd-` 类、`i-graphics-*` 是否生成 `background:url(data:image/svg+xml` 而非 mask、页面 json 的 `usingComponents` 是否含新增组件。',
      '在 README 或脚本注释中写明沙箱构建的已知问题与放行方式。',
    ],
    ac: [
      '`bash scripts/ci-check.sh <改动文件...>` 可一条命令跑完并输出三段结果，退出码 0/非 0 语义明确。',
      '在干净分支上跑通；故意引入一个 lint 错误后能被检出。',
      '故意把 `i-graphics-*` 改成 mask 模式后，产物断言能报错。',
      '不改动任何既有业务代码。',
    ],
    dont: [
      '不要顺手修复既有 lint 告警（会造成大面积 diff，干扰其他 Agent 的 rebase）。',
      '不要引入新的构建工具或替换 vite/uni-app。',
      '不要新增 npm 依赖（本项目刻意保持零新增依赖的可审计性）。',
    ],
    refs: ['docs/08 §6.4 验收方法'],
  },
  {
    id: 'XJ-102',
    title: '设计令牌扩展：达标语义色、徽章、任务完成态、印章、周报封面',
    wave: 'W1',
    agent: 'ds',
    priority: 'P0',
    size: 'S',
    deps: [],
    decisions: [],
    filesOwn: [`${M}/style/index.scss`],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md'],
    value: '给后续所有「有状态」的视觉提供统一语义色，避免每个页面各自定义达标绿/警示红。',
    bg: [
      '现有令牌齐全但缺「状态语义色」：档案页达标条、徽章锁定态、任务完成态、印章红都没有对应变量。',
      '项目有三套皮肤（默认柔金、`.elder` 乐龄墨绿、`.night` 臻享夜色金），任何新令牌必须在三套下都有值，否则切肤后会回落成继承值导致不可读。',
    ],
    scope: [
      '新增 `--meter-ok` / `--meter-near` / `--meter-low`（达标 / 略偏 / 警示），用于档案与周报的进度条。',
      '新增 `--badge-bg` / `--badge-lock`（徽章已解锁底 / 未解锁底）。',
      '新增 `--task-done`（任务完成态底）。',
      '新增 `--stamp-ink`（印章红）。',
      '新增 `--report-bg` / `--report-ink`（周报封面，**刻意不随皮肤**，固定夜色黑金，形成「报告 = 珍视」的视觉语言）。',
      '在默认、`.xj.elder`、`.xj.night` 三处同步赋值；夜色金皮肤下需提高亮度补偿。',
    ],
    ac: [
      '三套皮肤下五个新分组变量都有显式值（用样式检查或截图证明，不依赖继承）。',
      '达标条颜色在浅底与深底上都能与背景形成可辨差异（对比度 ≥3:1，文字类 ≥4.5:1）。',
      '`--report-*` 在三套皮肤下取同一组值（不随皮肤变化）。',
      '新增变量不影响任何既有页面渲染（改动前后截图对比，仅新增、无覆盖）。',
    ],
    dont: [
      '不要修改变量已有名字或值（会引发全站视觉回归）。',
      '不要把新令牌定义在组件内（组件内只允许消费，不允许定义皮肤级变量）。',
    ],
    refs: ['docs/07 §6 设计令牌扩展'],
  },
  {
    id: 'XJ-103',
    title: '视觉细节令牌落地：间距阶梯、圆角阶梯、阴影三层、渐变方向',
    wave: 'W1',
    agent: 'ds',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-102'],
    decisions: ['D11', 'D12'],
    filesOwn: [`${M}/style/index.scss`, `${M}/style/visual.scss`],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '「看着不整齐」的根因是间距值随手写。把间距、圆角、阴影收敛成有限阶梯，后续 Agent 才有可依据的取值表。',
    bg: [
      '代码里间距混用 10/14/18/22px 等非阶梯值，这是页面「不整齐」的主因。',
      '阴影目前只有一个值，卡片之间没有纵深层级，悬停与浮层无法区分。',
    ],
    scope: [
      '定义间距阶梯：4 / 8 / 12 / 16 / 24 / 32（新增 `style/visual.scss` 集中定义，供后续 Issue 引用）。',
      '定义圆角阶梯（如 8 / 12 / 16 / 999）并给出使用场景。',
      '定义阴影三层 e0（无）/ e1（卡片默认）/ e2（悬停与浮层，按 D12 已定启用）。',
      '统一渐变方向为 150deg，给出参数写法。',
      '输出「旧值 → 新值」映射表写入本 Issue 的 PR 描述，供后续页面 Issue 直接照搬。',
    ],
    ac: [
      '新增令牌在 `style/visual.scss` 中集中定义，不散落在页面里。',
      '报告给出映射表：现有非阶梯间距值（10/14/18/22 等）各自对应到哪个阶梯值。',
      '阴影 e1/e2 在浅底与深底上视觉可辨（截图对比）。',
      '仅新增令牌与映射表，不改动既有页面样式（迁移由各页面 Issue 负责）。',
    ],
    dont: [
      '不要在本 Issue 里批量改页面样式——那会造成与页面 Agent 的写入冲突。',
      '不要引入 CSS 变量以外的抽象（不引入 SCSS mixin 层级体系，会超出小程序编译的稳妥范围）。',
    ],
    refs: ['docs/08 §5.1 间距阶梯', 'docs/08 §5.2 圆角阶梯', 'docs/08 §5.3 阴影三层', 'docs/08 §5.4 渐变方向'],
  },
  {
    id: 'XJ-104',
    title: '图标与图形底座三档统一（28/38/46，乐龄 34/46/56）',
    wave: 'W1',
    agent: 'ds',
    priority: 'P1',
    size: 'S',
    deps: ['XJ-103'],
    decisions: ['D13', 'D14'],
    filesOwn: [`${M}/style/index.scss`, `${M}/style/graphics.scss`],
    filesRead: [`${M}/components/XGraphic.vue`, `${M}/components/XIcon.vue`],
    value: '现在 `.ic-chip`(44px) 与 `.icon-box`(40px) 各有一套尺寸，图标大小随机。统一三档后视觉节奏才成立。',
    bg: [
      '`.ic-chip` 与 `.icon-box` 两套底座尺寸不一致（44 / 40px），且各自有 mid/sm 变体，导致同屏图标大小不齐。',
      '`XGraphic` 的 chip 三档已经是 28/38/46，`.elder` 下为 34/46/56，需要让单色底座与之对齐。',
    ],
    scope: [
      '把 `.ic-chip` 与 `.icon-box` 的尺寸归一到三档：28 / 38 / 46，`.elder` 下为 34 / 46 / 56。',
      '与 `XGraphic` 的 `chip sm/md/lg` 使用同一组变量，避免两套来源。',
      '保留原有 class 名不变（避免全站引用断裂），只改数值与变量来源。',
      '按 D14 同步调整 `.ic-chip` 的底色形态（深底 → 浅底），与尺寸归一在同一批完成。',
    ],
    ac: [
      '三档尺寸在单色图标与彩色图形上一致（同屏并排截图对比）。',
      '乐龄模式下自动放大到 34/46/56，无需页面单独处理。',
      '所有既有引用处（`.ic-chip` / `.icon-box`）未出现错位或溢出。',
    ],
    dont: [
      '`.ic-chip` 底色改动必须与 XJ-602 的图标枚举固定同批上线（D14 + D15），否则后端返回未收录图标名时会显示空白。',
      '不要删除旧 class 名——引用面广，删除等于全站视觉回归。',
    ],
    refs: ['docs/08 §5.5 图标体系', 'docs/09 §4.1'],
  },
  {
    id: 'XJ-105',
    title: '小镜 CSS 合成形象组件 XMascot',
    wave: 'W1',
    agent: 'ds',
    priority: 'P0',
    size: 'M',
    deps: [],
    decisions: ['D19'],
    filesOwn: [`${M}/components/XMascot.vue`, `${M}/style/mascot.scss`],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md'],
    value: '小镜目前没有形象。给它一个纯 CSS 合成的头像，是首页问候、魔镜对话、接力棒三处情感连接的前提。',
    bg: [
      '魔镜页是纯文字流，AI 回复没有「人」的形象载体，缺乏陪伴感。',
      '方案要求「先用 CSS 合成头像」，不引入图片资源——零包体积、三皮肤可自动换色。',
    ],
    scope: [
      '新建 `XMascot.vue`：金色渐变圆底 + 镜面高光 + 两点眼 + 弧线微笑 + 淡腮红，纯 CSS 几何合成，零图片资源。',
      'Props：`size`（32 / 48 / 72 / 88）、`state`（online / thinking / speaking / night）、`tone`。',
      '四态差异：online 带在线绿点；thinking 外圈旋转；speaking 显示声波；night 切夜色金配色。',
      '三皮肤适配走继承的自定义属性（定义在 `style/mascot.scss` 的 `page,.xj` / `.xj.elder` / `.xj.night`），组件内不写 `.elder` / `.night` 选择器。',
      '乐龄：描边加粗到 3px、五官放大 15%。',
      'thinking 的旋转属于「状态指示」而非装饰，乐龄下保留（与动效档位降级规则一致）。',
    ],
    ac: [
      '四个尺寸 × 四个状态在柔金 / 乐龄墨绿 / 夜色金三种底色上都能辨认（提供截图矩阵）。',
      '组件在任意页面引入即可正确渲染，无需页面额外传皮肤 class。',
      '乐龄模式下描边与五官按规格放大。',
      '`mo-off` 档位下 thinking 的旋转仍保留（状态指示），其余装饰性动画停止。',
      '零图片资源、零新增依赖。',
    ],
    dont: [
      '不要引入任何图片或字体图标作为小镜形象。',
      '不要在组件内写皮肤选择器（`.elder` / `.night`），必须走继承变量。',
      '不要用 `<svg>` 标签（小程序不支持）。',
    ],
    refs: ['docs/07 §2 小镜 CSS 合成形象'],
  },
  {
    id: 'XJ-106',
    title: '路由与分包预登记：5 个新页面占位',
    wave: 'W1',
    agent: 'fe',
    priority: 'P0',
    size: 'S',
    deps: [],
    decisions: [],
    filesOwn: [
      `${M}/pkg-family/relay.vue`,
      `${M}/pkg-me/achievements.vue`,
      `${M}/pkg-game/box.vue`,
      `${M}/pkg-archive/weekly.vue`,
      `${M}/pkg-module/stamps.vue`,
    ],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md', 'apps/miniapp/.gitignore'],
    value: '5 个新页面若等到各自 Issue 才建，路由要到最后才通，5 个 Agent 无法提前联调。先建占位页把路由打通，后续各 Agent 各写各的文件。',
    bg: [
      '本轮要新增 5 个页面：接力棒、徽章墙、盲盒、六维周报、门店集章册，所属分包均已存在。',
      '**实测更正**：`src/pages.json` 是 `gitignore` 的构建生成物（`apps/miniapp/.gitignore:34`），由各页 `definePage()` 宏经 uni-pages 生成，**不在版本控制内**。因此「5 个 Issue 同时改 `pages.json` 必然冲突」这一风险**结构上不存在**——每个页面只在**自己的 `.vue`** 里声明路由。',
      '所以本 Issue 的真正价值不是「抢占 `pages.json` 独占权」，而是**提前建好 5 个占位页把路由打通**，让依赖它们的页面 Issue 能提前联调。',
    ],
    scope: [
      '创建 5 个占位页：`XNav` + 空状态提示 + `definePage()` 配置（`navigationStyle: custom`，标题按设计文档）。',
      '路由由各页 `definePage()` 声明；`src/pages.json` 是生成物，**不要手工编辑、也不要提交**（已在 gitignore 内）。',
      '占位页根节点必须绑 `:class="xj.pageClass"`（全站约定，动效档位靠它下发）。',
      '构建后断言 `dist/build/mp-weixin/app.json` 的 `subPackages` 含 5 条新路由，确认路由已真正打通。',
      '不实现任何页面内容——内容由 XJ-402 ~ XJ-406 负责，本 Issue 只保证路由与占位可达。',
    ],
    ac: [
      '5 条新路由可在开发者工具中通过 `uni.navigateTo` 跳转并正常显示占位内容。',
      '分包根名称未变（`pkg-family` / `pkg-me` / `pkg-game` / `pkg-archive` / `pkg-module`）。',
      '构建产物 `app.json` 的 `subPackages` 含 5 条新路由，且 5 个页面均有 wxml / json 产出。',
      '页面上能看到 `mo-` 档位 class 已生效（不是裸页面）。',
      '`src/pages.json` 未被提交进版本库（`git status` 中不出现）。',
    ],
    dont: [
      '不要顺手调整其他页面的路由或分包结构。',
      '不要在本 Issue 里实现页面内容——各页面由后续专属 Issue 负责。',
      '不要手工编辑或提交 `src/pages.json`（gitignore 的生成物，改了也会被下次构建覆盖）。',
    ],
    refs: ['docs/07 §3.2 ~ §3.6'],
  },
  {
    id: 'XJ-107',
    title: '收口卡：接管动效/图形/入口零归属文件，修复按压反馈',
    wave: 'W1',
    agent: 'ds',
    priority: 'P0',
    size: 'S',
    deps: [],
    decisions: [],
    filesOwn: [
      `${M}/style/motion.scss`,
      `${M}/xj/motion.ts`,
      `${M}/components/XGraphic.vue`,
      `${M}/components/XBadge.vue`,
      `${M}/components/XReveal.vue`,
      `${M}/main.ts`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md', 'docs/09_小程序图形资源替换说明_v2.3.md', 'issues/OWNERSHIP.md'],
    value: 'docs/08/09 落地的动效与图形底座（motion.scss / motion.ts / XGraphic / XBadge / XReveal / main.ts）此前不在任何 files_own，无人可合法维护——导致动效与彩色图形的后续修复全部「空转」、按压反馈 mo-press-active 长期无主。本卡把这 6 个文件收口给 ds，让 W2 的 XJ-206/207/208 不再是隐性前置悬空。',
    bg: [
      '归属空洞是本轮 Issue 拆分的已知缺陷：6 个已落地的底座文件未被纳入任何 Issue 的 files_own，按「一个文件同一时刻只有一个 Owner」的规则，没有任何 Agent 能合法入库对它们的修复。',
      '最直接的后果：mo-press-active（按压反馈类）被全站 10+ 处 hover-class 引用，但其定义、降级、乐龄覆盖的维护权无主；XGraphic/XBadge/XReveal 的 bug 修复同样无主。',
      '这 6 个文件是 XJ-206（图表组件动效）/ XJ-207（档案页可视化）/ XJ-208（测评页动效）的隐性前置——不先补归属，这些 Issue 做出来的动效与彩色图形无法在底座层收敛。',
    ],
    scope: [
      '接管 6 个零归属文件的维护权（files_own），不重写既有实现，只做收口与已知缺陷修复。',
      '修复 mo-press-active 按压反馈：确认 motion.scss 的 .mo-press-active 定义在压缩产物 app.wxss 中存在且被 .mo-press 的 transition 正确驱动；乐龄/关闭档位下按压反馈降级为瞬时（无 transition 抖动）。',
      '确认 XReveal.vue 的 useReveal() 在 mo-off 档位下首帧即 shown（不依赖 IntersectionObserver），避免乐龄用户看到空白。',
      '确认 XGraphic.vue 的 i-graphics-* 仍走 bg 模式（见 XJ-101 产物断言），不被误改为 mask。',
      '确认 main.ts 的样式入口顺序（index.scss → visual → motion/graphics/mascot → uno.css）不被后续改动打乱。',
    ],
    ac: [
      'issues/OWNERSHIP.md 的独占文件表含这 6 个文件，Owner = XJ-107。',
      'ci-check.sh --assert-only 的 motion/graphics 底座断言按「定义存在」（@keyframes + 变量定义）通过，不再被宽前缀喂饱。',
      'app.wxss 含 .mo-press-active 定义（按压反馈不再失效）。',
      '乐龄模式下 XReveal 内容首帧可见（不闪空白）。',
      '不改动这 6 个文件的既有导出与公开 API（只收口归属 + 必要缺陷修复）。',
    ],
    dont: [
      '不要重写 motion.scss / motion.ts 的既有实现（已验证可用，只收口）。',
      '不要把 main.ts 的样式入口顺序改乱（visual 必须在 motion 之前，令牌先于动效）。',
      '不要在 motion.scss 里新增皮肤选择器（皮肤/档位走继承的自定义属性，见 docs/08 §8）。',
    ],
    refs: ['docs/08 §8 已落地的底座代码', 'docs/09 §4 图形渲染模式', 'issues/OWNERSHIP.md 归属空洞'],
  },

  /* ───────────────────────── W2 主 Tab 体验 ───────────────────────── */
  {
    id: 'XJ-201',
    title: '首页：连续签到激活条 + 「今日 3 件事」任务卡 + 小镜入口',
    wave: 'W2',
    agent: 'fe',
    priority: 'P0',
    size: 'L',
    deps: ['XJ-102', 'XJ-105', 'XJ-305'],
    decisions: ['D1', 'D8', 'D21'],
    filesOwn: [
      `${M}/pages/index/index.vue`,
      `${M}/components/home/HomeRender.vue`,
      `${M}/components/home/HomeSignin.vue`,
      `${M}/components/home/HomeTasks.vue`,
    ],
    filesRead: [`${M}/xj/motion.ts`, `${M}/components/XMascot.vue`],
    value: '首页是唯一能让人「每天想来打开」的位置。加上签到与今日任务，首页从静态宫格变成有「今天做了什么 / 还没做」的状态回写。',
    bg: [
      '首页目前是配置驱动的静态宫格：图标 + 文字，没有当日状态，也没有「做了给什么」的即时反馈。',
      '签到、任务、积分三个体系后端已存在，缺的是首页的展示与状态回写。',
    ],
    scope: [
      '新增「连续签到」激活条：金色渐变底，左「已连续签到 N 天」大数字，右「本月已签 M 天」，未签今日时显示「去签到」，已签则显示今日已得积分。',
      '新增「今日 3 件事」任务卡：三项任务带进度环，完成项降级为灰字 + `✓`；数据来自后端动态生成（XJ-305）。',
      '问候栏右侧接入 `XMascot`（32px，online 态）作为魔镜入口；按 D21 **保留现有 `mirrorFab` 悬浮球**，头像为第二入口（标准皮肤下两者并存，乐龄下移交给 XJ-203 的语音条）。',
      '入场动效复用 `mo-rise` + `mo-d1~6` 错峰；进度环变化走 `mo-grow-x`（只动 transform 与 opacity）。',
      '按压反馈用原生 `hover-class="mo-press-active"` + `hover-stay-time="80"`，不用 CSS `:active`（小程序不支持）。',
    ],
    ac: [
      '未签到 / 已签到两种状态下激活条文案与样式都正确。',
      '任务完成后进度环有过渡，且完成后刷新页面状态保持。',
      '点击激活条跳签到日历、点击小镜跳魔镜、点击任务跳对应页面。',
      '标准皮肤下问候栏头像与 `mirrorFab` 悬浮球**同时存在且都能进入魔镜页**（按 D21）。',
      '`mo-off`（乐龄）档位下无入场动画，内容首帧即可读。',
      '漏签只显示「从今天继续」，页面无倒计时、无催促文案。',
    ],
    dont: [
      '不要在首页监听 `onPageScroll`，也不要在滚动回调里 setData。',
      '不要做倒计时、连签中断惩罚、裂变诱导（健康产品不做焦虑驱动）。',
      '不要让 `HomeRender.vue` 超过必要改动——它是本 Issue 独占文件，其他 Issue 需在本 Issue 合并后再改。',
    ],
    refs: ['docs/06 §3.1', 'docs/07 §4.2', 'docs/08 §3.1', 'docs/08 §3.2'],
  },
  {
    id: 'XJ-202',
    title: '首页组件启用矩阵：访客 / C 悦享 / B 尊享 / A 臻享',
    wave: 'W2',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-201'],
    decisions: ['D6'],
    filesOwn: [`${M}/components/home/HomeRender.vue`, `${M}/components/home/HomeGate.vue`],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md'],
    value: '同一套首页服务四类用户，现在差异靠后端配置零散拼凑。矩阵化后每类用户看到的第一屏才真正对味。',
    bg: [
      '会员等级为 `TIER_NAMES = { A: 臻享会员, B: 尊享会员, C: 悦享会员 }`，另有访客与乐龄维度。',
      '设计文档给出 18 个首页组件 × 5 种状态的启用矩阵，但代码里没有统一的编排层。',
    ],
    scope: [
      '新增 `HomeGate.vue` 或在 `HomeRender.vue` 内实现模块编排层，按用户状态决定模块启用与顺序。',
      '访客：只讲「六个维度是什么 + 免费领体检券」，不展示个人数据与任务。',
      'C 悦享：全套工具 + 游戏化任务（签到 / 今日 3 件事 / 存折 / 魔镜）。',
      'B 尊享：社交邀约前置（讲座占座 / 结伴拼团）+ 文旅权益 + 升级进度。',
      'A 臻享：**弱化积分与任务**，强化专属顾问、权益质感、年度报告入口。',
      '模块编排结果需与设计文档 §4.1 的矩阵逐项对齐。',
    ],
    ac: [
      '访客 / C / B / A 四种状态下首页截图具备明显差异，且与 §4.1 矩阵一致。',
      'A 级用户首页不出现积分任务类模块（或明显弱化）。',
      '访客首页不出现任何个人健康数据。',
      '切换用户等级后首页立即重排，无需重启小程序。',
    ],
    dont: [
      '不要为四种状态各写一套组件——用编排配置驱动，避免后续维护四份。',
      '不要修改后端返回结构（后端增强走 XJ-305）。',
    ],
    refs: ['docs/07 §4.1 组件启用矩阵', 'docs/07 §4.2 各变体要点'],
  },
  {
    id: 'XJ-203',
    title: '乐龄版首页：墨绿大字号、家人入口前置、语音小镜条',
    wave: 'W2',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-202'],
    decisions: ['D10', 'D21'],
    filesOwn: [`${M}/components/home/HomeElder.vue`, `${M}/components/home/HomeRender.vue`],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md'],
    value: '乐龄用户是核心人群。他们需要的是「今天要做的 2 件小事」和「一键找家人」，而不是游戏化激励。',
    bg: [
      '项目已有 `.elder` 墨绿皮肤与「乐龄强制关闭动效」的约定，但首页仍与标准版共用同一套模块编排。',
      '乐龄用户认知负荷预算更低，信息密度需要显著下调。',
    ],
    scope: [
      '乐龄首页模块替换为：「今天要做的 2 件小事」（而非 3 件）+ 家人入口前置 + 语音小镜条。',
      '按 D21：乐龄下保持原设计，**由底部语音条替代 `mirrorFab` 悬浮球**（避免遮挡大字内容），不叠加悬浮球。',
      '字号与触控热区放大（热区 ≥44px），图标与文字同步放大。',
      '游戏化元素（签到连击、积分、徽章、排行榜）在乐龄下不展示。',
      '动效档位强制为 `mo-off`，页面首帧即完整可读。',
      '语音小镜条提供「按住说话」入口，交互路径不超过一次点击。',
    ],
    ac: [
      '乐龄首页与标准首页在模块构成、字号、信息密度上有可截图证明的差异。',
      '乐龄下无任何入场动画（档位为 `mo-off`）。',
      '家人入口在首屏可见，无需滚动。',
      '触控热区实测 ≥44px。',
      '游戏化模块在乐龄下完全不渲染。',
      '乐龄首页**不出现 `mirrorFab` 悬浮球**（由底部语音条替代，按 D21）。',
    ],
    dont: [
      '不要给乐龄强行保留游戏化元素。',
      '不要提供乐龄动效的手动覆盖入口（按 D10，乐龄强制 `off`）。',
      '不要在乐龄首页同时保留语音条与 `mirrorFab`（按 D21，仅语音条）。',
    ],
    refs: ['docs/07 §4.3 乐龄版六条关键差异', 'docs/08 §2.4 三级档位'],
  },
  {
    id: 'XJ-204',
    title: 'A 级臻享夜色金全站适配',
    wave: 'W2',
    agent: 'ds',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-102', 'XJ-103'],
    decisions: ['D6'],
    filesOwn: [`${M}/style/index.scss`, `${M}/xj/store.ts`],
    filesRead: [`${M}/App.ku.vue`],
    value: 'A 级用户付的是「质感」。全站夜色金是等级差异最直观的表达，比任何文案都有效。',
    bg: [
      '项目已存在 `.night` 臻享夜色金皮肤，但目前没有触发入口，等于闲置。',
      '全部 49 个页面都绑定了 `:class="xj.pageClass"`，这是零改动下发皮肤的最佳注入点。',
    ],
    scope: [
      '在 `xj/store.ts` 的 `pageClass` 计算属性中，当会员等级为 A 时追加 `night` class 与 `std`/`elder` 组合。',
      '按 D6 在「我的 → 设置」保留浅色可切换选项；用户显式选择优先于等级默认。',
      '校验夜色金下所有既有令牌（含 XJ-102 新增项）的可读性，必要时提高亮度补偿。',
      '白字 / 金底对比度必须达标（金底统一配深棕墨字 `--on-brand`，白字对比仅 2.4:1 不达 WCAG）。',
    ],
    ac: [
      'A 级用户登录后全站呈夜色金（4 个主 Tab + 抽查 5 个分包页面）。',
      'B / C / 访客不受影响。',
      '乐龄 + A 级的组合行为明确且合理（需在 Issue 内给出结论）。',
      '所有文字对比度达标（提供数值表）。',
    ],
    dont: [
      '不要在页面里逐页写皮肤判断——必须走 `pageClass` 单点下发。',
      '不要降低既有令牌的可读性来「凑」夜色金效果。',
    ],
    refs: ['docs/07 §4.2', 'docs/08 §7 无障碍与可读性护栏'],
  },
  {
    id: 'XJ-205',
    title: '魔镜页人格化改造：小镜头像 + 状态 + 回复内行动卡',
    wave: 'W2',
    agent: 'fe',
    priority: 'P0',
    size: 'M',
    deps: ['XJ-105'],
    decisions: ['D19'],
    filesOwn: [`${M}/pages/mirror/index.vue`, `${M}/components/mirror/ActionCard.vue`],
    filesRead: [`${M}/components/XMascot.vue`, `${M}/services/mirror*`],
    value: '魔镜是小程序最有差异化的功能，但现在是纯文字流。给它一个固定的「人」和可执行的动作卡，陪伴感才立得住。',
    bg: [
      '魔镜页 248 行，本质是消息流；AI 回复是一大段文字，用户看完不知道下一步做什么。',
      '小镜形象组件（XJ-105）提供形象，本 Issue 负责让它「活」在页面里。',
    ],
    scope: [
      '页面头部改为固定的小镜头像（`XMascot`，48px）+ 在线状态 + 「今日已聊 N 轮」。',
      '状态联动：等待回复时 `thinking`，流式输出时 `speaking`，空闲时 `online`。',
      '回复中的可执行内容抽成 `ActionCard.vue`：如「4-7-8 呼吸法」「喝水提醒」「拉伸 3 分钟」，卡片可直接点击触发对应动作或跳转。',
      '长回复折叠：默认显示摘要 + 「展开全文」，避免一屏全是文字。',
      '消息入场用 `mo-cross` 交叉淡入；发送/接收的反馈走 `mo-press`。',
    ],
    ac: [
      '头部小镜头像在三种状态下正确切换（提供截图）。',
      '回复中出现行动卡时可点击并产生正确行为；纯文字回复不受影响。',
      '超过阈值的长回复默认折叠，可展开。',
      '乐龄下头像与字号同步放大，无入场动画。',
      '流式输出期间不触发全页 setData（仅消息区更新）。',
    ],
    dont: [
      '不要在消息流里嵌套滚动容器制造双滚动条。',
      '不要在流式输出时用整页 setData 刷新。',
      '不要修改魔镜后端接口（本轮不动 `mirror.service.ts`）。',
    ],
    refs: ['docs/06 §3.3', 'docs/07 §2.6 应用位置'],
  },
  {
    id: 'XJ-206',
    title: '图表组件库：XIndexRing 指数环 + XTrendChart 可点按趋势曲线',
    wave: 'W2',
    agent: 'ds',
    priority: 'P0',
    size: 'M',
    deps: [],
    decisions: [],
    filesOwn: [`${M}/components/chart/XIndexRing.vue`, `${M}/components/chart/XTrendChart.vue`],
    filesRead: [`${M}/xj/utils.ts`],
    value: '档案页与周报都要「一眼看懂」。把指数环与趋势曲线做成组件，档案、周报、我的页三处复用，不再各写一份 SVG。',
    bg: [
      '项目无图表库，图表是手写 SVG：`xj/utils.ts` 的 `radarSvg` / `lineSvg` 生成的是**静态字符串**，无法交互、无法做生长动画。',
      '档案页现有趋势折线是一次性渲染的图片，点按无反馈。',
    ],
    scope: [
      '`XIndexRing.vue`：SVG 圆环，支持 0~100 指数、中心数字、可选数字滚动；`stroke-dashoffset` 生长动画 800ms。',
      '`XTrendChart.vue`：渐变面积曲线 + 可点按数据点 + 提示气泡；数据以 props 传入（`series` / `labels` / `unit`）。',
      '两组件均只动 `transform` / `opacity` / `stroke-dashoffset`，不使用 `width` 过渡。',
      '`mo-off` 档位下直接呈现最终态（生长动画跳过）。',
      '组件不自行发请求，数据由页面注入（保持可复用与可测）。',
    ],
    ac: [
      '两组件可独立传值渲染（提供独立自检方式，如临时页面或注释中的用法示例）。',
      '生长动画在 `mo-full` 下播放、在 `mo-off` 下直接呈现（录屏对比）。',
      '点按数据点显示对应数值，连续点按无错位。',
      '指数环数字滚动时长与设计规范一致（≤600ms）。',
    ],
    dont: [
      '不要引入图表库（包体积与小程序兼容性双重风险）。',
      '不要在组件内硬编码业务色，颜色走令牌或 props。',
      '不要修改 `xj/utils.ts` 的既有导出（其他页面仍在使用 `radarSvg` / `lineSvg`）。',
    ],
    refs: ['docs/06 §3.2', 'docs/08 §3.5 状态切换'],
  },
  {
    id: 'XJ-207',
    title: '档案页数据可视化升级：指数环 + 趋势曲线 + 达标条 + 人话结论',
    wave: 'W2',
    agent: 'fe',
    priority: 'P0',
    size: 'L',
    deps: ['XJ-102', 'XJ-206'],
    decisions: ['D8', 'D20'],
    filesOwn: [`${M}/pages/archive/index.vue`, `${M}/components/archive/DimCard.vue`],
    filesRead: ['docs/06_小程序视觉优化方案_v2.0（互动化改版提案）.md'],
    value: '档案页现在「能读数，但看不懂」。改造目标是从读数变成看懂：一个指数、一条可点曲线、六个维度的达标结论。',
    bg: [
      '档案页 123 行，主要是数字卡片 + 静态折线。用户看到 78 分不知道是好还是不好。',
      '六维定义为：肌肤 / 体型 / 轮廓 / 体能 / 体态 / 心灵。',
    ],
    scope: [
      '总分改为 `XIndexRing` 指数环（按 D8 保留数字滚动，≤600ms 完成）。',
      '趋势折线替换为 `XTrendChart`，可点按查看某日数值。',
      '六维改为 `DimCard`：每维一个卡片，含达标进度条（用 `--meter-*`）+ 一句人话结论（如「达标 55%」「略高于预期」「优秀」）。',
      '滚动触发出场用 `useReveal` / `XReveal`（`mo-reveal` + `is-in`），只播一次。',
      '加载态补骨架屏，形状与真实内容对应，交叉淡入 240ms，不做尺寸跳变。',
    ],
    ac: [
      '指数环、趋势曲线、六维达标条三处都可交互并正确显示数据。',
      '达标条颜色由 `--meter-ok / near / low` 驱动，三皮肤下均可辨。',
      '每个维度都有非技术性的人话结论。',
      '滚动到视口时才播放入场，且不重复播放。',
      '首屏入场 ≤800ms；动画期间无 setData（用开发者工具验证）。',
    ],
    dont: [
      '不要使用焦虑性措辞（如「差」「危险」「你落后了」）。',
      '不要监听 `onPageScroll`，滚动触发只能用 `uni.createIntersectionObserver`。',
      '不要修改后端档案接口结构。',
    ],
    refs: ['docs/06 §3.2', 'docs/08 §3.3 滚动触发', 'docs/08 §3.4 加载与过渡状态'],
  },
  {
    id: 'XJ-208',
    title: '测评流程可视化：答题进度环 + 雷达生长 + 结果分维度卡片化',
    wave: 'W2',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-206'],
    decisions: ['D17'],
    filesOwn: [
      `${M}/pkg-assess/intro.vue`,
      `${M}/pkg-assess/map.vue`,
      `${M}/pkg-assess/question.vue`,
      `${M}/pkg-assess/result.vue`,
      `${M}/components/XRadar.vue`,
    ],
    filesRead: [`${M}/components/chart/XIndexRing.vue`],
    value: '测评是转化入口，现在的答题过程没有进度感，结果页是一堆数字。加进度环与雷达生长，完成率和可读性都会提升。',
    bg: [
      '答题页无进度提示，用户不知道还剩多少题。',
      '结果页的雷达图是静态 SVG，且结果以数字罗列呈现，缺少「分维度」的叙事。',
    ],
    scope: [
      '答题页顶部加进度环（复用 `XIndexRing` 或轻量版），随题号实时更新。',
      '结果页雷达图加从中心生长的动画（`stroke-dashoffset` 或 `scale`），`mo-off` 下直接呈现。',
      '结果页改为分维度卡片化：每维一卡，含得分、结论、建议。',
      '按 D17 为雷达图叠加维度图形（图形只能作为兄弟节点，不能嵌入 SVG 内部）。',
      '注意：紧急就医页 `pkg-assess/urgent` **不做入场动画**（本 Issue 不改该文件）。',
    ],
    ac: [
      '进度环随题号更新且与实际进度一致。',
      '雷达生长动画在 `mo-full` 播放、`mo-off` 跳过。',
      '结果页每个维度都有独立卡片与结论。',
      '`pkg-assess/urgent` 未被改动。',
    ],
    dont: [
      '不要改动 `pkg-assess/test-balance.vue` / `test-chair.vue`（属 XJ-702）。',
      '不要在雷达图 SVG 内部嵌套外部图形（小程序不支持）。',
      '不要给紧急页加入场动画。',
    ],
    refs: ['docs/06 §3.2', 'docs/07 §5 内部页面动态化清单', 'docs/09 §3.3'],
  },

  /* ───────────────────────── W3 后端 ───────────────────────── */
  {
    id: 'XJ-301',
    title: 'Prisma 三张新表：UserBadge / FamilyRelay / StoreStamp',
    wave: 'W3',
    agent: 'be',
    priority: 'P0',
    size: 'M',
    deps: [],
    decisions: ['D2', 'D3', 'D7'],
    filesOwn: ['apps/server/prisma/schema.prisma', 'apps/server/prisma/seed.ts'],
    filesRead: ['docs/07_小程序互动化改版设计规格_v2.1.md'],
    value: '徽章、接力棒、集章册三个玩法各需一张轻量表。三张表落地后，W3 与 W4 的接口与页面才能并行开工。',
    bg: [
      '现有 68 个模型中已有 `Checkin`、`PointsLedger`、`GameProgress`、`FamilyLink`，但**没有**徽章、接力、印章模型。',
      '签到与盲盒可复用现有积分流水，不需要新表。',
    ],
    scope: [
      '新增 `UserBadge`：`customerId`、`badgeCode`、`unlockedAt`、`progress`，唯一约束 `(customerId, badgeCode)`。',
      '新增 `FamilyRelay`：`customerId`、`peerId`、`date`、`passedAt`，唯一约束覆盖同一对用户每天一条。',
      '新增 `StoreStamp`：`customerId`、`storeId`、`stampedAt`、`operatorStaffId`，唯一约束保证一店一月一枚（业务层校验 + 索引）。',
      '补齐必要索引，保证按 `customerId` 查询高效。',
      '保持 SQLite → MySQL 兼容（不用 SQLite 专有类型）。',
      '`seed.ts` 补演示数据：至少 1 个用户的部分已解锁徽章、1 组接力记录、2 枚印章，便于前端联调。',
    ],
    ac: [
      '`pnpm db:reset` 或等效命令成功执行，三张新表可读写。',
      '唯一约束生效（重复写入按要求被拒或幂等处理）。',
      '`seed.ts` 可重复执行不报错。',
      '未修改任何既有模型字段（`git diff` 仅新增）。',
    ],
    dont: [
      '不要改动既有 68 个模型的字段或关系。',
      '不要使用 SQLite 专有语法（未来要切 MySQL）。',
      '不要在本 Issue 实现接口逻辑（属 XJ-302 ~ XJ-304）。',
    ],
    refs: ['docs/07 §8 后端接口需求'],
  },
  {
    id: 'XJ-302',
    title: '后端：签到扩展字段 + 六维周报聚合接口 + 档案结论字段',
    wave: 'W3',
    agent: 'be',
    priority: 'P0',
    size: 'M',
    deps: [],
    decisions: ['D5', 'D20'],
    filesOwn: ['apps/server/src/controllers/app.controller.ts', 'apps/server/src/services/archive.service.ts'],
    filesRead: ['apps/server/prisma/schema.prisma'],
    value: '签到日历、六维周报、档案可视化三处前端都卡在这些接口上。先冻结契约，前端就能拿 mock 并行开工。',
    bg: [
      '现有 `GET /app/checkins`（app.controller.ts:537）返回的字段不足以渲染月历网格与连签进度。',
      '周报需要六维环比的周聚合，目前没有对应接口。',
      '档案页需要「人话结论」，但结论口径必须与六维算法同源（D20），不能由前端推断。',
    ],
    scope: [
      '扩展 `GET /app/checkins`：新增 `streakDays`（连续签到天数）与 `monthSignedDates`（本月已签日期数组）。',
      '新增 `GET /app/archive/weekly?week=`：返回当周指数、环比、三件事（复用 assess 的 `three` 结构）、六维变化数组。',
      '按 D20 在档案 / 趋势接口补齐结论字段：`verdict`（一句人话结论，如「达标 55%」「略高于预期」）与 `targetPct`（达标百分比），口径必须与六维算法同源。',
      '周报数据复用 `archive.service.ts` 已有聚合能力，不新建数据表。',
      '接口在 `docs` 或 PR 描述中给出**完整响应示例**（前端按此并行开发）。',
      '按 D5 本期只做站内数据，不引入订阅消息推送；推送需求另开 Issue，不并入本 Issue。',
    ],
    ac: [
      '两个接口的响应结构在 PR 中有示例，且与设计文档字段名一致。',
      '空数据（新用户 / 无记录周）有兜底结构，不返回 null 导致前端崩。',
      '周报「上一期」可通过 `week` 参数获取。',
      '`verdict` / `targetPct` 与六维算法口径一致，同一指标在档案页与周报中结论相同（D20）。',
      '接口有权限校验（仅本人数据）。',
    ],
    dont: [
      '`app.controller.ts` 是共享文件，本 Issue 为串行队列第一棒；XJ-303 / 304 / 305 必须在本 Issue 合并后再改。',
      '不要改动其他已有接口的返回结构（会破坏前端）。',
    ],
    refs: ['docs/07 §8 后端接口需求'],
  },
  {
    id: 'XJ-303',
    title: '后端：成就徽章接口 + /app/me 扩字段',
    wave: 'W3',
    agent: 'be',
    priority: 'P0',
    size: 'M',
    deps: ['XJ-301', 'XJ-302'],
    decisions: ['D2'],
    filesOwn: ['apps/server/src/controllers/app.controller.ts', 'apps/server/src/services/tier.service.ts'],
    filesRead: ['apps/server/prisma/schema.prisma'],
    value: '徽章墙与「我的」页成长体系共用这一组数据。徽章由已有数据推导并落库，不额外增加运营成本。',
    bg: [
      '设计文档要求徽章墙与我的页展示成长进度，但 `/app/me` 目前不含成长与徽章字段。',
      '设计按 24 枚徽章（坚持 8 / 探索 8 / 分享 8）规划，需确认运营是否够用（D2）。',
    ],
    scope: [
      '新增 `GET /app/achievements`：返回 `{ unlocked, total, groups[] }`，每组含徽章列表、点亮状态、进度（如 `19/30`）。',
      '徽章解锁条件由现有数据推导：积分流水、档案完整度、家人绑定数、签到记录；推导结果幂等写入 `UserBadge`。',
      '扩展 `GET /app/me`：新增 `nextTier`、`growthValue`、`badges`（已解锁徽章摘要）。',
      '提供徽章定义的集中配置（code / 名称 / 分组 / 条件 / 图形名），供前端 `XBadge` 消费。',
    ],
    ac: [
      '徽章接口返回结构清晰，前端可直接渲染 3 组 × 3 列网格。',
      '重复调用不产生重复徽章记录（幂等）。',
      '`/app/me` 新增字段不破坏既有前端（旧字段全部保留）。',
      '徽章名称与解锁条件可在同一处配置中查到。',
    ],
    dont: [
      '不要改动既有 `/app/me` 字段语义。',
      '不要把徽章逻辑散落在多个服务里——集中到一处配置 + 一个服务方法。',
    ],
    refs: ['docs/07 §3.3', 'docs/07 §8'],
  },
  {
    id: 'XJ-304',
    title: '后端：接力棒 / 健康盲盒 / 门店集章册接口',
    wave: 'W3',
    agent: 'be',
    priority: 'P1',
    size: 'L',
    deps: ['XJ-301', 'XJ-302'],
    decisions: ['D3', 'D4', 'D7'],
    filesOwn: ['apps/server/src/controllers/app.controller.ts', 'apps/server/src/controllers/game.controller.ts'],
    filesRead: ['apps/server/prisma/schema.prisma', 'apps/server/src/common/game-config.ts'],
    value: '三个新玩法页（接力棒、盲盒、集章册）的接口一次性交付，W4 的三个页面即可完全并行。',
    bg: [
      '`game.controller.ts` 已有转盘等抽奖模型，盲盒可复用其概率与发奖逻辑，避免重复实现。',
      '`FamilyLink` 模型已存在，接力棒在其之上扩展即可（按 D3 仅限已绑定家人）。',
    ],
    scope: [
      '接力棒：`GET /app/family/relay`（接力状态、双方记录、本周格子）、`POST /app/family/relay/pass`（接棒，双方各 +5 积分并写 `PointsLedger`）。',
      '盲盒：`GET /app/games/box`（剩余次数、奖品池）、`POST /app/games/box/open`（服务端随机发奖，返回奖品）。',
      '集章册：`GET /app/stores/stamps`（门店列表、盖章状态）、`POST /app/stores/stamps/:id`（顾问扫码盖章，一月一店限一枚）。',
      '所有积分变动必须写 `PointsLedger` 并更新余额，保持与现有积分体系一致。',
      '按 D4，知识卡内容源需明确；若为 AI 生成必须标注「不构成医学建议」。',
      '盲盒概率公示字段随接口返回，供页面展示。',
    ],
    ac: [
      '六个接口均有响应示例，字段与设计文档一致。',
      '接棒一次双方各 +5 积分，余额与流水一致；同一天重复接棒被拒。',
      '盲盒随机性在服务端，前端无法预知结果；剩余次数正确扣减。',
      '重复盖章被拒（一店一月一枚）。',
      '并发请求下积分与次数不出现超发。',
    ],
    dont: [
      '不要在前端计算概率或发奖——必须服务端决策。',
      '不要绕开 `PointsLedger` 直接改积分余额。',
      '不要引入地图 SDK 或地理数据（门店玩法用集章册形态）。',
    ],
    refs: ['docs/07 §3.2', 'docs/07 §3.4', 'docs/07 §3.6', 'docs/07 §8'],
  },
  {
    id: 'XJ-305',
    title: '后端：首页「今日 3 件事」动态生成',
    wave: 'W3',
    agent: 'be',
    priority: 'P0',
    size: 'M',
    deps: ['XJ-302'],
    decisions: ['D1'],
    filesOwn: ['apps/server/src/services/home.service.ts'],
    filesRead: ['apps/server/src/controllers/app.controller.ts'],
    value: '首页任务卡不能是固定文案。按用户的六维短板与待办动态生成，首页才有「这是给我的」的针对性。',
    bg: [
      '`home.service.ts` 已按 `data.components` 生成首页配置，具备编排能力，但还没有「今日任务」模块。',
      '按 D1 决议执行：依当期六维短板 + 待办（体检券 / 测评 / 方案）动态生成，不使用固定文案。',
    ],
    scope: [
      '在 `home.service.ts` 中新增「今日 3 件事」生成逻辑：优先取六维短板，其次取待办（未用体检券 / 未完成测评 / 方案里的日常小事）。',
      '最多返回 3 项，已完成项从今日清单剔除。',
      '每项返回：`code`、标题、副标、目标值 / 当前值、跳转路径、图标语义枚举。',
      '访客返回空数组（首页不展示任务卡）。',
      '结果随 `GET /app/home` 一起下发，不新增接口。',
    ],
    ac: [
      'C / B / A 会员返回 3 项任务，访客返回 0 项。',
      '已完成的任务不在清单中；完成任务后刷新首页确实少一项。',
      '每项都带可用的跳转路径，点击可达。',
      '生成逻辑对「无档案 / 无方案」的新用户有兜底任务（按 D1：降级为「完成首次六维测评」）。',
    ],
    dont: [
      '不要新增数据表或新接口。',
      '不要返回固定文案（必须与用户数据相关）。',
      '不要返回倒计时类任务（健康产品不做焦虑驱动）。',
    ],
    refs: ['docs/06 §3.1', 'docs/07 §10-1'],
  },

  /* ───────────────────────── W4 互动玩法 ───────────────────────── */
  {
    id: 'XJ-401',
    title: '签到日历改造：月历网格 + 7 格奖励轨道 + 里程碑',
    wave: 'W4',
    agent: 'fe',
    priority: 'P0',
    size: 'L',
    deps: ['XJ-102', 'XJ-302'],
    decisions: ['D8'],
    filesOwn: [
      `${M}/pkg-points/checkin.vue`,
      `${M}/components/points/CalendarGrid.vue`,
      `${M}/components/points/RewardTrack.vue`,
    ],
    filesRead: [`${M}/components/XGraphic.vue`],
    value: '签到是最高频的每日动作。从「一个按钮」升级成「看得见积累的日历」，打卡动机才可持续。',
    bg: [
      '现有 `pkg-points/checkin.vue` 仅 69 行，是一个简单打卡按钮，没有日历、没有连签激励、没有里程碑。',
      '后端已支持扩展字段（XJ-302 提供 `streakDays` 与 `monthSignedDates`）。',
    ],
    scope: [
      '顶部连签卡：金色渐变；左「已连续签到 N 天」大数字，右「本月已签 M 天」。',
      '月历网格（`CalendarGrid.vue`）：7 列；已签 = 金底实心圆；今日 = 白底 + 2px 金描边；过去未签 = 灰底；未来 = 浅灰。',
      '7 格奖励轨道（`RewardTrack.vue`）：+2 / +2 / +3 / +3 / +5 / +5 / 金蛋；金蛋格虚线描边 + 蛋形图形。',
      '「今日还可做」三项任务（睡眠 / 运动 / 喝水），已完成降级为灰字 + `✓`。',
      '里程碑：连签 7 / 14 / 30 天解锁金蛋（15 积分 + 门店体验券）。',
      '动效：签到成功 `+5` 上浮淡出 600ms；金蛋格 `scale` 脉冲（`mo-off` 下静止）。',
      '漏签只显示「从今天继续」，不做中断惩罚提示。',
    ],
    ac: [
      '四种日期状态（已签 / 今日 / 过去未签 / 未来）在同一屏内视觉可辨。',
      '连签天数与本月已签天数与后端数据一致。',
      '签到成功有 `+5` 上浮动画，乐龄下无动画但仍清晰显示积分变化。',
      '金蛋格在未解锁 / 已解锁两态下样式不同。',
      '与 XJ-401 关联的入口（首页签到条）跳转可达。',
    ],
    dont: [
      '不要做倒计时催促或连签中断惩罚（健康产品不做焦虑驱动）。',
      '不要新增数据表（签到复用现有 `Checkin` 模型与积分流水）。',
      '不要在日历网格里为每个日期绑定独立事件处理导致性能问题——用事件委托。',
    ],
    refs: ['docs/07 §3.1'],
  },
  {
    id: 'XJ-402',
    title: '健康接力棒：与家人互接的健康打卡',
    wave: 'W4',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-106', 'XJ-304'],
    decisions: ['D3'],
    filesOwn: [`${M}/pkg-family/relay.vue`],
    filesRead: [`${M}/components/XMascot.vue`, `${M}/pkg-family/list.vue`],
    value: '家人是乐龄用户最强的维系纽带。接力棒把「我做健康」变成「我们一起做健康」，且双方都有即时收益。',
    bg: [
      '项目已有 `FamilyLink` 与家人相关页面，但没有「共同行为」的机制。',
      '设计要点：接力中断**不做惩罚**，断签日标记为「休息日」，避免给乐龄用户压力。',
    ],
    scope: [
      '接力状态卡：墨绿渐变；「你和 XX 的接力」+ 连续天数 + 今日是否待接棒。',
      '接力环：左「我」头像 + 中间虚线连接 + 握手图形 + 右家人头像（含已接棒时间）；头像复用 `XMascot`。',
      '规则说明区：接棒后双方各得 5 积分；一天一次，0 点重置。',
      '本周接力：7 格；已接 = 墨绿 `✓`；休息 = 灰「休」；今日 = 虚线描边「今」。',
      '主按钮：「接棒打卡」金色渐变，副标「我 +5 · 女儿 +5」（按实际家人关系生成称呼）。',
      '入口同时挂在 `pkg-family/list` 顶部（该文件由 XJ-705 负责，本 Issue 只提供组件与用法说明）。',
    ],
    ac: [
      '接棒成功后双方积分各 +5，页面即时刷新。',
      '同一天重复接棒被拒并有友好提示。',
      '休息日显示为「休」而非「漏」；页面无任何惩罚性文案。',
      '未绑定家人时展示引导去绑定的空状态。',
      '与首页乐龄家人卡的数据一致。',
    ],
    dont: [
      '不要做中断惩罚、连续天数归零提示。',
      '不要在接力环里使用图片资源（头像用 XMascot 合成）。',
      '不要修改 `pkg-family/list.vue`（属 XJ-705）。',
    ],
    refs: ['docs/07 §3.2', 'docs/07 §3.7'],
  },
  {
    id: 'XJ-403',
    title: '成就徽章墙：3 组 24 枚 + 进度环 + 详情展开',
    wave: 'W4',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-106', 'XJ-303'],
    decisions: ['D2', 'D18'],
    filesOwn: [`${M}/pkg-me/achievements.vue`],
    filesRead: [`${M}/components/XBadge.vue`, `${M}/components/chart/XIndexRing.vue`],
    value: '徽章把「坚持」变成可收藏的实体。徽章墙是长期留存最有效的载体。',
    bg: [
      '组件层已就绪：`XBadge` 支持未解锁（Tabler 线稿 + 虚线盘）/ 已解锁（彩色图形 + 金环）/ 新解锁（弹入 + 光晕）三态。',
      '「我的」页已接入 4 枚徽章作为试点，本 Issue 做完整徽章墙。',
    ],
    scope: [
      '顶部进度：`XIndexRing` 或 SVG 圆环显示「已点亮 8 / 24」+ 下一称号提示（再点亮 2 枚解锁「健康达人」）。',
      '分组 Tab：坚持 / 探索 / 分享；选中金底白字，其余白底描边。',
      '徽章网格 3 列：已解锁 = 彩色图形 + 名称；未解锁 = 灰底虚线 + 锁形 + 名称 + 迷你进度条 + `19/30`。',
      '点击展开详情：图标 + 名称 + 解锁条件 + 点亮日期 + 「分享给家人」/「看别人点亮」。',
      '点亮动效 `scale(0.8 → 1.05 → 1)` 400ms，乐龄下直接呈现。',
    ],
    ac: [
      '三种徽章状态（未解锁 / 已解锁 / 新解锁）都能渲染，与「我的」页试点一致。',
      '分组 Tab 切换正确，未解锁徽章显示真实进度而非占位数字。',
      '详情展开信息完整，分享动作可用。',
      '乐龄下 3 列网格不溢出，徽章与文字同步放大。',
      '24 枚徽章的图形全部来自已登记的 `GRAPHICS` 注册表（不出现空图形）。',
    ],
    dont: [
      '不要在页面里新造图形名（必须先扩 `src/icons/graphics/` 与注册表，属 XJ-601）。',
      '不要用 `filter: grayscale()` 做未解锁态（小程序端表现不一致）。',
      '不要新建数据表（`UserBadge` 由 XJ-301 提供）。',
    ],
    refs: ['docs/07 §3.3', 'docs/09 §4.2'],
  },
  {
    id: 'XJ-404',
    title: '健康盲盒：知识卡收藏玩法',
    wave: 'W4',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-106', 'XJ-304'],
    decisions: ['D4'],
    filesOwn: [`${M}/pkg-game/box.vue`],
    filesRead: [`${M}/pkg-game/wheel.vue`, `${M}/components/XGraphic.vue`],
    value: '转盘重复玩会腻。盲盒主打「知识卡收藏」，与转盘的积分导向形成互补，延长玩法生命周期。',
    bg: [
      '`pkg-game/wheel.vue` 已有积分转盘，抽奖模型与概率框架可复用。',
      '差异化要求：转盘主打积分，盲盒主打知识卡收藏，入口文案与图标必须区分，避免同质。',
    ],
    scope: [
      '头部：标题 + 副标 + 右上「今日剩余 N 次」。',
      '盲盒区：可拆盒 = 金色渐变 + 十字缎带；待解锁 = 灰底虚线 + 灰度图形。',
      '奖品说明：健康知识卡（常见）/ 积分 5·10·20（常见）/ 门店体验券（稀有，玫瑰红标识）。',
      '次数获取说明：今日签到 +1 / 完成 1 项任务 +1 / 与家人接力成功 +1。',
      '主按钮「拆一个盲盒」+ 副标「每日免费 1 次」。',
      '开盒动效：分层元素合成（盒盖抬起 + 内容弹入 + 光晕），`mo-off` 下直接呈现结果。',
      '合规：概率公示在页面内；知识卡标注「不构成医学建议」。',
    ],
    ac: [
      '盲盒三种状态（可拆 / 待解锁 / 已拆完今日次数）正确展示。',
      '开盒后有明确的奖品呈现，稀有奖品有差异化标识。',
      '概率公示在页面内可查。',
      '知识卡底部有「不构成医学建议」声明。',
      '与积分转盘在入口文案、图标、主色调上有可见区分。',
    ],
    dont: [
      '不要在前端计算概率或自行发奖。',
      '不要做付费抽奖或任何诱导付费的设计。',
      '不要在知识卡里给出诊断性或用药建议（合规）。',
    ],
    refs: ['docs/07 §3.4'],
  },
  {
    id: 'XJ-405',
    title: '六维周报：夜色黑金封面 + 六维环比 + 可分享',
    wave: 'W4',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-102', 'XJ-302', 'XJ-106'],
    decisions: ['D5'],
    filesOwn: [`${M}/pkg-archive/weekly.vue`],
    filesRead: [`${M}/components/chart/XTrendChart.vue`, `${M}/pkg-archive/trend.vue`],
    value: '周报是「被珍藏」的内容形态，也是家人之间自然传播的载体。夜色黑金让它与日常页面区分开。',
    bg: [
      '档案体系已有趋势、报告、时间轴等页面，缺少「周期性总结」这一层。',
      '设计要求封面固定夜色黑金（用 `--report-*`），不随皮肤变化，形成「报告 = 珍视」的视觉语言。',
    ],
    scope: [
      '封面卡：夜色黑金（`--report-bg` / `--report-ink`）；左指数 + 环比，右雷达图；右上角「第 N 期」。',
      '本周三件事：做得不错（绿）/ 需要留意（琥珀）/ 下一步（金），复用 assess 的 `three` 结构。',
      '六维变化：6 行，每行「色块 + 维度名 + 进度条 + 环比（`+4` / `持平`）」。',
      '操作：「分享给家人」+「看看上期」。',
      '合规：底部固定「品牌指数，不是医学指标」。',
      '按 D5 本 Issue 只做站内页面，不做订阅消息推送。',
    ],
    ac: [
      '封面在三套皮肤下都保持夜色黑金（不随皮肤变化）。',
      '六维环比数值与后端一致，改善 / 持平 / 下降三种状态可辨。',
      '「看看上期」能取到上一周数据。',
      '底部合规声明固定可见（不随滚动消失）。',
      '分享动作可用且分享内容不含个人敏感健康数据。',
    ],
    dont: [
      '不要使用焦虑性措辞表述「下降」。',
      '不要做医学指标暗示（必须声明为品牌指数）。',
      '不要让封面跟随皮肤变化（这是刻意设计）。',
    ],
    refs: ['docs/07 §3.5'],
  },
  {
    id: 'XJ-406',
    title: '门店集章册：印章收集形态（不做地图打点）',
    wave: 'W4',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-106', 'XJ-304'],
    decisions: ['D7'],
    filesOwn: [`${M}/pkg-module/stamps.vue`],
    filesRead: [`${M}/components/XGraphic.vue`],
    value: '把「去过几家店」变成看得见的印章册。乐龄用户对印章的认知成本远低于地图，同时规避地图数据合规风险。',
    bg: [
      '设计决策：**不采用地图打点**，改为集章册形态。理由：乐龄用户对印章认知成本低；门店数量少（试点 1 家）地图信息密度不足；规避地图数据合规风险。',
      '当前仅五月花店 1 家试点，但数据结构按 N 家设计（D7）。',
    ],
    scope: [
      '顶部进度：金色渐变；「我的健康印章册」+「已集 3 / 6 家」+ 集满奖励说明。',
      '常去门店卡：大缩略图 + 门店名 + 距离 + 标签（已预约 N 次 / 常去）+ **红色圆形印章**（旋转 -12°，含「已盖章 + 日期」），印章用纯 CSS 合成。',
      '待集门店列表：每行「图标 + 门店名 + 距离 + 虚线圆形待盖章」。',
      '盖章规则：① 到店完成项目或体检 ② 出示集章册由顾问扫码 ③ 一月内每店限 1 枚。',
      '主按钮「去门店预约」+ 最近门店距离。',
    ],
    ac: [
      '已盖章 / 待盖章两种印章视觉区分明显，印章有旋转与做旧质感。',
      '印章为纯 CSS 合成，无图片资源。',
      '门店数量为 1 时页面不塌陷（布局兼容 N=1）。',
      '盖章规则文案与后端校验逻辑一致（一店一月一枚）。',
      '页面无任何地图组件、地图 SDK 或地理坐标数据。',
    ],
    dont: [
      '**不得引入地图 SDK、地图组件或自绘地理数据**。若未来确需真实地图，必须使用腾讯位置服务 SDK / 腾讯地图小程序插件，坐标从其合规接口获取。',
      '不要用图片做印章（必须纯 CSS 合成以支持三皮肤与乐龄）。',
    ],
    refs: ['docs/07 §3.6', 'docs/07 §10-7'],
  },

  /* ───────────────────────── W5 成长体系 ───────────────────────── */
  {
    id: 'XJ-501',
    title: '「我的」页成长体系：等级进度条 + 徽章行 + 存折横幅 + 快完成了',
    wave: 'W5',
    agent: 'fe',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-102', 'XJ-303'],
    decisions: [],
    filesOwn: [`${M}/pages/me/index.vue`],
    filesRead: [`${M}/components/XBadge.vue`, `${M}/pkg-me/tier.vue`],
    value: '「我的」页现在是菜单堆叠，看不出成长。加上等级进度与「快完成了」，用户才知道再做什么能升级。',
    bg: [
      '「我的」页 208 行，已接入 4 枚徽章试点（由 `xj.me` 的 `points` / `familyCount` / `tier` 推导，零后端改动）。',
      'XJ-303 会为 `/app/me` 补充 `nextTier` / `growthValue` / `badges`，本 Issue 消费这些字段。',
    ],
    scope: [
      '等级进度条：显示当前等级、下一等级、还差多少积分（`growthValue`）。',
      '徽章行：从 4 枚扩展到 8 枚（取最近解锁或最有代表性的），点击进入徽章墙。',
      '存折横幅：显示积分余额实际数值 + 「查看明细」入口。',
      '「快完成了」卡：如果某徽章进度 ≥ 80%，单独提示「再签 2 天就点亮」。',
      '权益表高亮当前等级列（`pkg-me/tier` 的表格在 XJ-706 处理，本 Issue 只做我的页入口数据）。',
    ],
    ac: [
      '等级进度条数值与 `/app/me` 的 `growthValue` / `nextTier` 一致。',
      '徽章行点击可进入徽章墙（XJ-403）。',
      '存折横幅显示真实积分而非占位数字。',
      '「快完成了」卡只在存在 ≥80% 进度的徽章时出现。',
      '乐龄下字号放大且无入场动画。',
    ],
    dont: [
      '不要重复实现徽章逻辑（复用 XJ-303 返回的 `badges`）。',
      '不要修改 `pkg-me/tier.vue`（属 XJ-706）。',
      '不要用心理施压文案（如「再不升级就亏了」）。',
    ],
    refs: ['docs/06 §3.4', 'docs/07 §5'],
  },

  /* ───────────────────────── W6 图形资源 ───────────────────────── */
  {
    id: 'XJ-601',
    title: '图形资源补齐：维度标识、封面占位、加载环、空状态',
    wave: 'W6',
    agent: 'ds',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-104'],
    decisions: ['D17'],
    filesOwn: [`${M}/icons/graphics`, `${M}/xj/graphics.ts`, `${M}/uno.config.ts`, `${M}/style/graphics.scss`, 'apps/miniapp/scripts/fetch-graphics.js', 'docs/09_小程序图形资源替换说明_v2.3.md'],
    filesRead: ['docs/09_小程序图形资源替换说明_v2.3.md'],
    value: '把还缺的图形补齐，让档案、周报、加载态、空状态全都有视觉语言，而不是灰色占位。',
    bg: [
      '现有 47 个彩色图形（Microsoft Fluent Emoji，MIT），已用于首页六维宫格与「我的」页徽章行。',
      '仍缺：档案 / 周报的维度标识、封面加载失败占位、加载环、空状态图形。',
    ],
    scope: [
      '新增维度标识图形（对应 肌肤 / 体型 / 轮廓 / 体能 / 体态 / 心灵 六个维度，供雷达图与周报使用）。',
      '新增封面图加载失败 / 空数据占位图形。',
      '新增加载环图形（配合 `gd-spin` 合成动图）。',
      '新增空状态图形（与项目已有 base64 SVG 空状态插画风格协调）。',
      '更新 `scripts/fetch-graphics.js` 的清单并重跑（脚本幂等），同步刷新 `manifest.json` 与 `LICENSE.md`。',
      '保持「资源文件 / `GRAPHICS` 注册表 / `uno.config.ts` safelist」三层严格一致，并跑一致性校验。',
      '同步更新设计文档 09 的替换清单与体积表。',
    ],
    ac: [
      '一致性校验脚本通过：资源文件数 = 注册表项数 = safelist 条数，且本地名与类名后缀一一对应。',
      '新增图形在构建产物中生成 `background:url(data:image/svg+xml...)`（彩色模式），未变成 mask。',
      '图形体积增量 ≤ 20KB（给出实测数值）。',
      '`LICENSE.md` 与 `manifest.json` 覆盖全部新增图形的来源与许可。',
      '按 D17，档案页雷达图的维度标识叠加方案在 Issue 内给出结论（图形只能作兄弟节点，不能嵌入 SVG 内部）。',
    ],
    dont: [
      '不要引入非 MIT / 非 Apache / 非 CC0 的图标集（如 CC-BY-SA 的 openmoji 有传染性，已排除）。',
      '不要把图形放到 `src/static/`（会被全量拷贝导致体积翻倍）。',
      '不要在 `GRAPHICS` 里用模板字符串拼类名（UnoCSS 静态扫不到，图形会静默消失）。',
    ],
    refs: ['docs/09 §2 资源选型与许可', 'docs/09 §3.3 ~ §3.6'],
  },
  {
    id: 'XJ-602',
    title: '图标语义枚举固定 + 前端映射层（为 .ic-chip 彩色化铺路）',
    wave: 'W6',
    agent: 'be',
    priority: 'P1',
    size: 'S',
    deps: ['XJ-601'],
    decisions: ['D14', 'D15'],
    filesOwn: ['apps/server/src/common/icon-enum.ts', `${M}/xj/icon-map.ts`],
    filesRead: [`${M}/components/XGraphic.vue`, `${M}/components/XIcon.vue`],
    value: '首页待办图标名来自后端，直接换彩色图形会因为「后端返回了未收录的名字」而显示空白。先把枚举固定下来，彩色化才是安全的。',
    bg: [
      '首页 `todos` 的图标名由后端返回，前端直接映射到图标类。',
      '`XGraphic` 是 bg 模式（彩色但不可换色），`XIcon` 是 mask 模式（可换色但单色）—— 两者不可兼得，必须明确分工。',
    ],
    scope: [
      '在后端固定一份图标语义枚举（约 12 个，如 `skin` / `body` / `contour` / `fitness` / `posture` / `mind` / `checkup` / `plan` / `points` / `family` / `store` / `know`）。',
      '后端返回图标时只返回枚举值，不返回具体图标名。',
      '前端新增 `xj/icon-map.ts`：枚举值 → `XGraphic` 图形名（彩色）的映射；未命中时回退到 `XIcon` 单色图标，**绝不出现空白**。',
      '给出「功能性图标继续用 XIcon（箭头 / 勾选 / 表单 / tabbar），情感化图形用 XGraphic」的判断准则文档。',
    ],
    ac: [
      '后端返回的图表枚举全部在映射表覆盖范围内（用脚本或测试断言）。',
      '故意返回一个未收录的枚举值时，前端回退到单色图标而不是空白。',
      '映射表是新增独立文件，不改动任何页面。',
      'tabbar / 箭头 / 勾选等换肤相关图标未被改为彩色。',
    ],
    dont: [
      '不要改动 tabbar 图标（换成彩色会破坏换肤能力与选中态语义）。',
      '不要在页面里硬编码图标名绕过映射层。',
    ],
    refs: ['docs/09 §3.4', 'docs/09 §3.7', 'docs/09 §9-1'],
  },
  {
    id: 'XJ-603',
    title: '死资源清理与包体积回收',
    wave: 'W6',
    agent: 'ds',
    priority: 'P2',
    size: 'S',
    deps: [],
    decisions: ['D16'],
    filesOwn: [`${M}/static`],
    filesRead: ['docs/09_小程序图形资源替换说明_v2.3.md'],
    value: '`static/images/avatar.jpg` 57.4 KB 全项目零引用，正好抵消本轮彩色图形的增量。',
    bg: [
      '`static/images/avatar.jpg` 体积 57.4 KB，全项目零引用（模板遗留）。',
      '本轮彩色图形让 `app.wxss` 增加约 59 KB，删除死资源可基本抵消。',
    ],
    scope: [
      '先跑引用扫描，输出「零引用资源清单」到 Issue 评论，再执行删除（先报告后删除）。',
      '按 D16 删除零引用的 `avatar.jpg`（57.4 KB），并记录回收后的包体积。',
      '删除后复测主包体积，输出「删除前 / 删除后」对比。',
      '确认 `.gitignore` 未影响 `src/static/` 的正常跟踪。',
    ],
    ac: [
      '删除前列出零引用清单；清单内每一项都经过二次确认。',
      '删除后引用扫描零命中，构建通过。',
      '主包体积下降 ≥50 KB（给出实测数值）。',
      '未删除任何仍被引用的资源。',
    ],
    dont: [
      '不要删除仍在引用的资源（必须先扫描确认）。',
      '不要顺手清理其他目录或做目录结构重排。',
      '不要删除 `.workbuddy/` 目录（项目数据，非缓存）。',
    ],
    refs: ['docs/09 §3.8', 'docs/09 §6 体积预算'],
  },

  /* ───────────────────────── W7 内部页面动态化 ───────────────────────── */
  {
    id: 'XJ-701',
    title: '档案模块 5 页动态化（trend / report / timeline / hospital）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-101', 'XJ-103'],
    decisions: [],
    filesOwn: [
      `${M}/pkg-archive/trend.vue`,
      `${M}/pkg-archive/report.vue`,
      `${M}/pkg-archive/timeline.vue`,
      `${M}/pkg-archive/hospital.vue`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '档案模块是用户最常回看的地方。加上滚动触发与骨架屏，长内容的浏览体验会明显顺滑。',
    bg: [
      '全站当前只有 4 个 keyframes、7 个文件有 transition，几乎等于没有动效体系。',
      '动效底座已落地（`style/motion.scss` + `xj/motion.ts` + `XReveal`），页面只需加类。',
    ],
    scope: [
      '按 docs/08 §4 编排表：trend = 滚动触发 ●、加载 ●；report = 滚动 ●、加载 ●；timeline = 滚动 ●；hospital = 全项精简。',
      '接入方式优先用「模板加类」（`mo-rise` / `mo-d1~6` / `mo-reveal` + `is-in`），滚动触发只在首屏以下使用。',
      '时间轴加彩色节点（用语义色令牌）。',
      '报告页异常项高亮（用 `--meter-low` 系）。',
      '加载态补骨架屏，形状与真实内容对应。',
      '按压反馈统一用 `hover-class="mo-press-active"` + `hover-stay-time="80"`。',
    ],
    ac: [
      '四个页面在 `mo-full` 下有入场与滚动触发，在 `mo-off` 下首帧即完整可读。',
      '滚动触发只播一次，且通过 `uni.createIntersectionObserver` 实现（无 `onPageScroll`）。',
      '加载态骨架与真实内容形状匹配，无尺寸跳变。',
      '改动仅限本 Issue 独占的四个文件（不超过必要范围）。',
    ],
    dont: [
      '不要修改 `pages/archive/index.vue`（属 XJ-207）。',
      '不要监听 `onPageScroll`，不要在滚动回调里 setData。',
      '不要使用 `width` 过渡（只能用 `transform` / `opacity`）。',
    ],
    refs: ['docs/08 §4 逐页面动效编排', 'docs/08 §9 落地批次'],
  },
  {
    id: 'XJ-702',
    title: '测评模块动态化（intro / map / test-balance / test-chair）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-208'],
    decisions: [],
    filesOwn: [
      `${M}/pkg-assess/intro.vue`,
      `${M}/pkg-assess/map.vue`,
      `${M}/pkg-assess/test-balance.vue`,
      `${M}/pkg-assess/test-chair.vue`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '测评是转化路径，动效只做「确认收到」的反馈，不做干扰；紧急页保持第一帧即可读。',
    bg: [
      '测评共有 7 页，其中 `intro` / `map` / `question` / `result` 由 XJ-208 负责可视化改造。',
      '`urgent`（请尽快就医）按设计明确不做入场动画。',
    ],
    scope: [
      '按 docs/08 §4：intro / map / test-balance / test-chair 为「精简」档，主打交互反馈与状态切换。',
      '两页小测（test-balance / test-chair）加计时反馈与结果动画（**只动 transform / opacity**）。',
      '表单与选择类交互统一按压反馈。',
      '加载态补骨架。',
    ],
    ac: [
      '四个页面在 `mo-off` 下首帧完整可读。',
      '小测结果呈现有明确的完成反馈，且不影响可读性。',
      '未修改 `question.vue` / `result.vue` / `urgent.vue`。',
    ],
    dont: [
      '不要给 `pkg-assess/urgent.vue` 加任何入场动画（该文件也不在本 Issue 独占范围内）。',
      '不要改动测评的评分逻辑或题目数据结构。',
    ],
    refs: ['docs/08 §4'],
  },
  {
    id: 'XJ-703',
    title: '方案与体检 3 页动态化（pkg-plan/detail、pkg-checkup/book、coupons）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-101', 'XJ-103'],
    decisions: [],
    filesOwn: [`${M}/pkg-plan/detail.vue`, `${M}/pkg-checkup/book.vue`, `${M}/pkg-checkup/coupons.vue`],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '方案是「每天要做什么」的落地清单；把日常小事做成可勾选进度，方案从只读变成可执行。',
    bg: [
      '`pkg-plan/detail.vue` 是养护方案页，目前偏静态展示。',
      '体检券页缺「有效期」与「撕角」这类票券语义，用户不易判断能否用。',
    ],
    scope: [
      '方案页：日常小事加进度环（可勾选，状态与后端打卡一致）、门店安排缩略图、跟进节点脉冲（`gd-pulse`）。',
      '券包页：票券卡改为「撕角 + 有效期」，过期 / 可用 / 已用三态区分。',
      '预约页：时段选择器交互优化，选中态明确。',
      '表单类页面（预约）只做按压反馈与提交 loading，不做滚动触发。',
    ],
    ac: [
      '方案页日常小事勾选后状态持久化，进度环同步更新。',
      '券包页三态在视觉上可辨，有效期清晰。',
      '预约页提交有 loading 反馈，重复提交被阻止。',
      '`mo-off` 下无入场动画。',
    ],
    dont: [
      '不要在表单页做滚动触发动画（用户注意力在表单上）。',
      '不要改动预约与券的业务逻辑与接口。',
    ],
    refs: ['docs/08 §4', 'docs/07 §5'],
  },
  {
    id: 'XJ-704',
    title: '门店与模块 8 页动态化',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'L',
    deps: ['XJ-101', 'XJ-103'],
    decisions: [],
    filesOwn: [
      `${M}/pkg-module/store.vue`,
      `${M}/pkg-module/detail.vue`,
      `${M}/pkg-module/book.vue`,
      `${M}/pkg-module/buy.vue`,
      `${M}/pkg-module/orders.vue`,
      `${M}/pkg-module/transport.vue`,
      `${M}/pkg-module/lead-form.vue`,
      `${M}/pkg-module/vip.vue`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '门店模块是成交路径，重点是信息清晰与状态可追踪，动效只服务于「进度感」。',
    bg: [
      '门店分包 8 页覆盖浏览（store/detail）、下单（book/buy）、履约（orders/transport）、线索（lead-form）与 VIP 通道。',
      '订单状态目前缺少时间轴，用户看不出进度。',
    ],
    scope: [
      '价格排版规范化（用间距阶梯令牌）。',
      '详情页图片画廊：缩略图切换有过渡，加载有占位。',
      '订单列表加状态时间轴（已提交 / 已确认 / 已完成）。',
      '按 docs/08 §4：store / detail / orders 有加载过渡；表单类（book / buy / lead-form）只做按压反馈与提交 loading。',
      '长列表用 `staggerStyle()` 做错峰入场，但错峰封顶 300ms。',
    ],
    ac: [
      '8 个页面在 `mo-off` 下首帧完整可读。',
      '订单状态时间轴正确反映真实状态。',
      '长列表入场错峰不超过 300ms，且并发动画不超过 12 个。',
      '表单页无滚动触发动画。',
    ],
    dont: [
      '不要修改 `pkg-module/stamps.vue`（属 XJ-406）。',
      '不要在长列表里为每个元素单独创建 IntersectionObserver（会超并发预算）。',
    ],
    refs: ['docs/08 §4'],
  },
  {
    id: 'XJ-705',
    title: '家人模块 3 页动态化（list / view / accept）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-106'],
    decisions: [],
    filesOwn: [`${M}/pkg-family/list.vue`, `${M}/pkg-family/view.vue`, `${M}/pkg-family/accept.vue`],
    filesRead: [`${M}/components/XMascot.vue`, `${M}/pkg-family/relay.vue`],
    value: '家人列表是接力棒的入口。头像与健康状态点让「谁需要关心」一眼可见。',
    bg: [
      '家人模块已有 `list` / `view` / `accept` 三页，但缺少统一头像与健康状态表达。',
      '接力棒新页面（XJ-402）需要从家人列表顶部进入。',
    ],
    scope: [
      '家人头像统一用 `XMascot` 合成（不引入图片资源）。',
      '家人列表加健康状态点（正常 / 需留意 / 待跟进），用语义色而非纯装饰色。',
      '家人列表顶部加接力棒入口（卡片形式，数据读 XJ-304 的接口）。',
      '家人健康页（view）复用档案页组件（`DimCard` 等）保持表达一致。',
      '邀请页（accept）保持简洁，不做动效堆叠。',
    ],
    ac: [
      '头像全部为 CSS 合成，无图片资源。',
      '三个页面的健康状态点在四种状态下可辨。',
      '家人列表顶部接力棒入口可跳转且显示真实接力状态。',
      '`mo-off` 下无入场动画。',
    ],
    dont: [
      '不要修改 `pkg-family/relay.vue`（属 XJ-402）。',
      '不要用颜色单独承载健康状态语义（需配文字或图形，兼顾色觉障碍）。',
    ],
    refs: ['docs/08 §4', 'docs/07 §3.7'],
  },
  {
    id: 'XJ-706',
    title: '「我的」模块 6 页动态化（tier / requests / messages / settings / advisor / memories）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'M',
    deps: ['XJ-501'],
    decisions: ['D9'],
    filesOwn: [
      `${M}/pkg-me/tier.vue`,
      `${M}/pkg-me/requests.vue`,
      `${M}/pkg-me/messages.vue`,
      `${M}/pkg-me/settings.vue`,
      `${M}/pkg-me/advisor.vue`,
      `${M}/pkg-me/memories.vue`,
    ],
    filesRead: [`${M}/pages/me/index.vue`, 'docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '会员等级页是升级转化的关键页面。权益表高亮当前等级列，用户才能立刻看懂「升上去多什么」。',
    bg: [
      '`pkg-me/tier.vue` 已有权益对比表，但当前等级列没有视觉强调。',
      '按 D9，设置页需要新增「省流模式」显式开关（默认跟随设备自动判定）。',
    ],
    scope: [
      '等级页：权益表高亮当前等级列；升级进度条与「还差 N 积分」。',
      '设置页：新增「省流模式」开关（D9），与 `xj/motion.ts` 的档位机制联动；说明文案需让用户看懂「省流 = 少动画」。',
      '消息中心 / 预约记录：列表项入场错峰 + 加载骨架。',
      '顾问页：优先响应承诺做成可视化（如「4 小时内响应」标识）。',
      '记忆页（memories）：分组展示，删除有确认与撤销。',
    ],
    ac: [
      '等级页当前等级列高亮，切换等级后高亮跟随。',
      '省流模式开关真实生效：开启后全站档位降为 `mo-lite`，并能被用户关闭。',
      '列表错峰入场不超过 300ms。',
      '`mo-off` 下无入场动画。',
    ],
    dont: [
      '不要给 `about` / `privacy` / `consents` 三个合规页加动效（属 XJ-708，且明确不做游戏化）。',
      '不要用「限时」「最后 N 名」类胁迫性文案促升级。',
    ],
    refs: ['docs/08 §4', 'docs/08 §10-2'],
  },
  {
    id: 'XJ-707',
    title: '积分与游戏 6 页动态化（passbook + wheel / cards / quiz / tree / match3）',
    wave: 'W7',
    agent: 'fe',
    priority: 'P2',
    size: 'L',
    deps: ['XJ-401'],
    decisions: [],
    filesOwn: [
      `${M}/pkg-points/passbook.vue`,
      `${M}/pkg-game/wheel.vue`,
      `${M}/pkg-game/cards.vue`,
      `${M}/pkg-game/quiz.vue`,
      `${M}/pkg-game/tree.vue`,
      `${M}/pkg-game/match3.vue`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '存折页把积分从「数字」变成「曲线」，游戏页的一致性让整个积分体系更好理解。',
    bg: [
      '存折页现在是流水列表，看不出增长趋势。',
      '5 个游戏页（转盘 / 翻牌 / 问答 / 种树 / 消消乐）风格不统一。',
    ],
    scope: [
      '存折页：加迷你趋势图（复用 `/app/points` 数据，无需新接口）+ 积分获取来源分组。',
      '5 个游戏页统一按压反馈、加载态与结果呈现方式。',
      '游戏结果动画只动 `transform` / `opacity`，`mo-off` 下直接呈现结果（这一点在游戏页尤其重要，乐龄用户可能不玩）。',
      '统一「积分获得」的呈现方式（数字上浮 + 图标）。',
    ],
    ac: [
      '存折页有趋势可视化且与流水数据一致。',
      '6 个页面在 `mo-off` 下首帧完整可读且可正常操作。',
      '游戏结果在任何档位下都能被明确感知（即使没有动画，也要有静态结果展示）。',
      '未修改 `pkg-points/checkin.vue`（属 XJ-401）。',
    ],
    dont: [
      '不要修改游戏的核心玩法逻辑与概率。',
      '不要让游戏结果强依赖动画呈现（`mo-off` 下必须同样清晰）。',
    ],
    refs: ['docs/08 §4'],
  },
  {
    id: 'XJ-708',
    title: '认证 3 页 + 合规 3 页：认证补反馈、合规只提清晰度',
    wave: 'W7',
    agent: 'fe',
    priority: 'P3',
    size: 'M',
    deps: ['XJ-101', 'XJ-103'],
    decisions: [],
    filesOwn: [
      `${M}/pkg-auth/login.vue`,
      `${M}/pkg-auth/profile.vue`,
      `${M}/pkg-auth/consent.vue`,
      `${M}/pkg-me/privacy.vue`,
      `${M}/pkg-me/consents.vue`,
      `${M}/pkg-me/about.vue`,
    ],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '合规页不做游戏化是硬约束。用户来这里是要确认「我的数据去哪了」，任何动效都是干扰。',
    bg: [
      '设计明确：合规设置类页面（隐私 / 授权 / 条款 / 关于）**不做游戏化与动效**，只做清晰度提升。',
      '登录 / 资料 / 授权流程页使用 `xj.stdPageClass`（固定标准样式，不读乐龄模式，避免新用户被预设为大字号）。',
    ],
    scope: [
      '认证 3 页（login / profile / consent）：补按压反馈、输入校验反馈、提交 loading；不做入场动画堆叠。',
      '合规 3 页（privacy / consents / about）：授权卡片化、隐私收集清单结构化、记忆分组；**不加任何动效**。',
      '合规页优先提升排版与信息层级（间距阶梯、对比度），让内容更好读。',
      '隐私页需把「收集了什么、用在哪、能不能删」表达清楚。',
    ],
    ac: [
      '合规 3 页无任何新增动画（代码中不含 `mo-` / `an-` 动效类）。',
      '隐私页有三段清晰结构：收集内容 / 使用目的 / 用户权利。',
      '认证页提交有 loading，失败有明确原因。',
      '认证 3 页使用 `xj.stdPageClass`（不随乐龄放大）。',
    ],
    dont: [
      '**不要给合规页加动效、徽章、积分提示或任何游戏化元素**。',
      '不要改动授权与隐私的法律文案内容（只能调整呈现）。',
      '不要把认证页改成乐龄样式（固定 `stdPageClass`）。',
    ],
    refs: ['docs/08 §4 贯穿规则', 'docs/07 §5 合规与设置'],
  },

  /* ───────────────────────── W8 质量验收 ───────────────────────── */
  {
    id: 'XJ-801',
    title: '真机性能验收：帧率 / 并发 / 入场耗时 / setData 次数',
    wave: 'W8',
    agent: 'qa',
    priority: 'P0',
    size: 'M',
    deps: ['XJ-203', 'XJ-207', 'XJ-401', 'XJ-403'],
    decisions: ['D8'],
    filesOwn: ['docs/10_验收_性能_v1.0.md'],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '「流畅」必须是可测量的，否则每加一个动效都是赌。用真机数据卡住性能预算，才能放心继续加。',
    bg: [
      '性能预算是：首屏入场 ≤800ms、并发动画 ≤12 个、动画期 0 次 setData、帧率 ≥55fps。',
      '低端机走 `mo-lite` 档位（`benchmarkLevel` ≤20），iOS 与取不到值时按满配处理不误降级。',
    ],
    scope: [
      '在至少一台低端 Android（`benchmarkLevel` ≤20）与一台 iOS 上实测。',
      '测量并记录：首屏入场耗时、动画期间 setData 次数、并发动画峰值、滚动帧率、最低帧率。',
      '验证档位降级链路：`mo-full` → `mo-lite`（低端机 / 省流）→ `mo-off`（乐龄强制）。',
      '验证「取不到 benchmarkLevel」时不误降级。',
      '输出报告含表格 + 截图 + 结论（是否放行）。',
    ],
    ac: [
      '报告给出四项预算的实测值与判定（达标 / 不达标）。',
      '若某项不达标，给出具体到文件与类的定位。',
      '确认动画期间 setData 次数为 0（关键项）。',
      '确认乐龄与低端机路径确实降级，iOS 未被误降级。',
      '报告可作为后续性能回归的基线。',
    ],
    dont: [
      '不要为了跑分而临时关闭功能（测量必须基于真实配置）。',
      '不要修改业务代码；发现的问题登记为新 Issue 交由对应 Agent 修复。',
    ],
    refs: ['docs/08 §6 性能规范'],
  },
  {
    id: 'XJ-802',
    title: '无障碍与可读性走查：对比度 / 乐龄 / 减弱动效 / 触控热区',
    wave: 'W8',
    agent: 'qa',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-204', 'XJ-403'],
    decisions: ['D10', 'D11'],
    filesOwn: ['docs/10_验收_无障碍_v1.0.md'],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md'],
    value: '乐龄用户是核心人群，对比度与热区不达标等于功能不可用。这一关用数值卡住，不靠感觉。',
    bg: [
      '已有约束：金底统一配深棕墨字 `--on-brand`（白字对比仅 2.4:1 不达 WCAG）。',
      '乐龄模式强制关闭动效，且不提供覆盖入口。',
    ],
    scope: [
      '计算并列出三套皮肤下正文、次要文字、按钮文字、达标条、徽章文字的对比度数值。',
      '任意文字类对比度 <4.5:1、非文字类 <3:1 视为不达标。',
      '实测触控热区 ≥44px（重点检查乐龄与图标按钮）。',
      '验证系统「减弱动态效果」偏好下页面行为（若平台不支持自动读取则记录结论）。',
      '验证乐龄模式下动效全部关闭、字号放大、无信息丢失。',
    ],
    ac: [
      '报告含完整对比度数值表（颜色值 + 比值 + 判定）。',
      '所有不达标项都有明确的整改建议与影响文件。',
      '触控热区抽测结果记录在案。',
      '乐龄模式复查：无动效、字号达标、无内容被裁切。',
    ],
    dont: [
      '不要修改业务代码；只出报告与阻断结论。',
      '不要用主观感受替代数值判定。',
    ],
    refs: ['docs/08 §7 无障碍与可读性护栏'],
  },
  {
    id: 'XJ-803',
    title: '视觉回归走查：三皮肤 × 底座三档 × 徽章三态矩阵',
    wave: 'W8',
    agent: 'qa',
    priority: 'P1',
    size: 'M',
    deps: ['XJ-104', 'XJ-202', 'XJ-406'],
    decisions: ['D13', 'D14'],
    filesOwn: ['docs/10_验收_视觉回归_v1.0.md'],
    filesRead: ['docs/08_小程序动效与视觉细节规范_v2.2.md', 'docs/09_小程序图形资源替换说明_v2.3.md'],
    value: '本轮改动横跨令牌、底座、图形三层，只有矩阵式截图才能发现「某一套皮肤下错位」这类隐性问题。',
    bg: [
      '本轮涉及：图标底座三档统一（改的是被大量引用的 `.ic-chip` / `.icon-box`）、`.ic-chip` 底色形态可能变更、六维图形替换、徽章三态、五个新页面。',
      '这些改动的影响面横跨三套皮肤与乐龄放大，单点截图无法覆盖。',
    ],
    scope: [
      '构建截图矩阵：3 皮肤（柔金 / 乐龄墨绿 / 夜色金）× 关键页面（首页 / 档案 / 我的 / 魔镜 / 5 个新玩页）。',
      '专项走查图标底座三档（28/38/46 与乐龄 34/46/56）在所有引用处的对齐与溢出。',
      '专项走查徽章三态（未解锁 / 已解锁 / 新解锁）在三皮肤下的可辨性。',
      '专项走查图形在深底上的可辨性（彩色图形是为浅底设计的）。',
      '输出回归结论与阻断项清单。',
    ],
    ac: [
      '截图矩阵归档且覆盖全部组合（缺项需说明原因）。',
      '发现的问题逐条定位到文件与选择器。',
      '明确给出「可发布 / 需修复后发布」结论。',
      '对比改动前的截图，确认没有非预期回归。',
    ],
    dont: [
      '不要用「看起来还行」这类主观结论代替逐项核对。',
      '不要修改业务代码。',
    ],
    refs: ['docs/09 §6 体积预算', 'docs/08 §5 视觉细节补齐'],
  },
]

/**
 * 决策门 —— **全部已定稿，无待定项**。
 *   id     决策编号
 *   q      事项
 *   d      最终决议（已采纳，直接执行）
 *   why    决议理由（Agent 遇到边界情况时按此裁量，不再回头问人）
 *   issues 受本决议约束的 Issue
 *
 * D1~D18：原「18 项待拍板事项」，已全部定稿。
 * D19~D21：docs/06 §7 遗留的 3 项（小镜形象 / 趋势结论字段 / 悬浮球去留），一并定稿。
 *
 * 修改本数组后必须重跑 `node scripts/gen-issues.mjs`。
 */
const DECISIONS = [
  {
    id: 'D1',
    q: '首页「今日 3 件事」由谁生成？',
    d: '后端按当期六维短板 + 待办（体检券 / 测评 / 方案）动态生成；无个人数据时降级为「完成首次六维测评」。',
    why: '六维短板是首页唯一能驱动复测的抓手，固定文案上线两周即失效。',
    issues: ['XJ-201', 'XJ-305'],
  },
  {
    id: 'D2',
    q: '徽章数量与命名是否够用？',
    d: '定稿 24 枚（坚持 8 / 探索 8 / 分享 8），命名与解锁条件见 docs/07 §3；运营扩量只加数据行，不改结构。',
    why: '24 枚覆盖「每天能拿 / 主动探索 / 对外分享」三类动机，是首次上线的最小完整集。',
    issues: ['XJ-301', 'XJ-303', 'XJ-403'],
  },
  {
    id: 'D3',
    q: '接力棒范围？未绑定家人时入口如何展示？',
    d: '仅限已绑定家人；未绑定时展示引导去绑定的空状态，不展示接力内容。',
    why: '健康数据属敏感信息，跨家庭传递合规风险高；空状态本身也是家人绑定的转化入口。',
    issues: ['XJ-301', 'XJ-304', 'XJ-402'],
  },
  {
    id: 'D4',
    q: '盲盒知识卡内容源？',
    d: '内容团队供稿，AI 仅出草稿且必须过合规审核；页面固定标注「不构成医学建议」。',
    why: '知识卡是唯一会被用户当结论转发的内容，必须走人工审核；免责标注是健康类内容的合规底线。',
    issues: ['XJ-304', 'XJ-404'],
  },
  {
    id: 'D5',
    q: '周报是否需要定时推送？',
    d: '本期只做站内展示，不做订阅消息推送；推送需求另开 Issue，不并入本轮。',
    why: '订阅消息需用户逐次授权且模板审核周期不可控，会拖住周报上线。',
    issues: ['XJ-302', 'XJ-405'],
  },
  {
    id: 'D6',
    q: 'A 级夜色金是否全站强制？',
    d: '默认全站切换夜色金，同时在「我的 → 设置」保留浅色可切换选项；用户显式选择优先于等级默认。',
    why: '夜色金是 A 级的身份感来源，但 45+ 用户在强光下阅读浅色更舒适，两者都要满足。',
    issues: ['XJ-202', 'XJ-204'],
  },
  {
    id: 'D7',
    q: '门店集章册其余 5 家门店数据来源？',
    d: '本期只上 1 家（五月花店），但数据结构与页面按 N 家设计，不做任何单店硬编码。',
    why: '数据结构一次做对，门店上线属运营节奏而非开发节奏，不应阻塞开发。',
    issues: ['XJ-301', 'XJ-304', 'XJ-406'],
  },
  {
    id: 'D8',
    q: '首屏是否保留数字滚动？',
    d: '保留，但压缩到 ≤600ms 完成；`mo-off` / `mo-lite` 档位与乐龄模式下直接显示最终值。',
    why: '数字滚动是首页「活起来」感最强的单点，600ms 内不影响秒开感。',
    issues: ['XJ-201', 'XJ-207', 'XJ-401', 'XJ-801'],
  },
  {
    id: 'D9',
    q: '「省流模式」是否对用户可见？',
    d: '在「我的 → 设置」放显式开关，默认值为「跟随设备自动判定」，用户可强制满效 / 轻效 / 关闭。',
    why: '低端机用户需要能自救；默认自动判定让多数人不必理解这个概念。',
    issues: ['XJ-706'],
  },
  {
    id: 'D10',
    q: '乐龄模式是否完全不给动效覆盖入口？',
    d: '强制 `mo-off`，不提供任何覆盖入口（含隐藏入口）。',
    why: '乐龄用户是眩晕与误触风险最高的人群，不给入口是产品责任，不是设计洁癖。',
    issues: ['XJ-203', 'XJ-802'],
  },
  {
    id: 'D11',
    q: '`--mo-rise` 用 16px 还是 12px？',
    d: '定为 16px。',
    why: '16px 在 375pt 宽下仍属克制范围但位移可感，12px 在小屏上几乎看不出入场；上线后若收到集中「太跳」反馈再降。',
    issues: ['XJ-103', 'XJ-802'],
  },
  {
    id: 'D12',
    q: '阴影 e2 是否引入？',
    d: '引入 e2，但仅用于悬停态与浮层，卡片默认仍为 e1。',
    why: '只在「元素脱离静态层」时加第三层，既建立纵深又不让页面显脏。',
    issues: ['XJ-103'],
  },
  {
    id: 'D13',
    q: '图标底座是否统一三档？',
    d: '统一为 28 / 38 / 46（乐龄 34 / 46 / 56），随视觉回归（XJ-803）一起测。',
    why: '现有 `.ic-chip`(44) 与 `.icon-box`(40) 的 4px 差异肉眼难辨，却是「不整齐」的主因；归一后与字号阶梯对齐。',
    issues: ['XJ-104', 'XJ-803'],
  },
  {
    id: 'D14',
    q: '待办 / 菜单 `.ic-chip` 是否彩色化？',
    d: '做，但必须与 D15 的枚举固定（XJ-602）**同批上线**：深底 → 浅底，随 XJ-803 视觉回归一起走查。',
    why: '枚举未固定时，后端返回未收录图标名会显示空白；两件事拆开上线必然出现一期空白图标。',
    issues: ['XJ-104', 'XJ-602', 'XJ-803'],
  },
  {
    id: 'D15',
    q: '后端图标枚举能否固定？',
    d: '固定一份 12 个语义枚举（如 `skin` / `body` / `mind` …），后端只返回枚举值，**不返回图标名**；前端维护枚举 → 图形映射层。',
    why: '图标名属表现层，后端返回图标名等于把视觉实现泄露进数据契约，换图就要改后端。',
    issues: ['XJ-602'],
  },
  {
    id: 'D16',
    q: '`static/images/avatar.jpg`（57.4 KB 零引用）是否删除？',
    d: '删除，并在 XJ-603 记录体积回收数据。',
    why: '全项目零引用（模板遗留），删掉正好抵消本轮彩色图形 59 KB 增量。',
    issues: ['XJ-603'],
  },
  {
    id: 'D17',
    q: '档案页雷达图是否加维度图形？',
    d: '加。图形只能作为兄弟节点叠加（小程序 SVG 内部不能嵌套外部图形），需微调雷达图留白布局。',
    why: '六维图形已在首页建立语义，档案页复用可降低认知成本。',
    issues: ['XJ-208', 'XJ-601'],
  },
  {
    id: 'D18',
    q: '徽章是否直接做完整徽章墙页面？',
    d: '做完整徽章墙（XJ-403），依赖 `UserBadge` 表（XJ-301）；不做只读展示版。',
    why: '徽章只有「可展示、可分享」才有激励价值，一排只读图标无法承载 24 枚。',
    issues: ['XJ-403'],
  },
  {
    id: 'D19',
    q: '小镜形象是否要上真实插画？',
    d: '本期用 CSS 合成形象（已落地 XMascot），不引入位图 / 插画资源。',
    why: '零图片资源、零包体积增量、三套皮肤自动换色；插画需外部排期且无法随皮肤变化。',
    issues: ['XJ-105', 'XJ-205'],
  },
  {
    id: 'D20',
    q: '趋势曲线 / 档案指标是否需要后端补结论字段？',
    d: '后端补 `verdict`（一句人话结论）+ `targetPct`（达标百分比），前端只渲染不推断。',
    why: '结论涉及健康判断口径，必须与六维算法同源；前端自行推断会出现同一数据两种说法。',
    issues: ['XJ-302', 'XJ-207'],
  },
  {
    id: 'D21',
    q: '现有 `mirrorFab` 悬浮球保留还是替换？',
    d: '**保留**悬浮球，问候栏头像作为**第二入口**（标准皮肤下两者并存）；乐龄皮肤下维持原设计，仍由底部语音条替代悬浮球以避免遮挡大字内容。',
    why: '悬浮球是现有用户已形成的操作习惯，贸然移除会造成「找不到小镜」；但乐龄版大字布局下悬浮球会遮挡内容，保持语音条替代。',
    issues: ['XJ-201', 'XJ-203'],
  },
]

/* ───────────────────────── 渲染 ───────────────────────── */

const allIds = new Set(ISSUES.map(i => i.id))
const blocksOf = {}
for (const i of ISSUES) {
  for (const d of i.deps) (blocksOf[d] ||= []).push(i.id)
}

const groups = ['fe', 'be', 'ds', 'infra', 'qa', 'pm'].map(g => [g, ISSUES.filter(i => i.agent === g).length])

function yamlList(name, arr) {
  if (!arr || !arr.length) return `${name}: []`
  return `${name}:\n${arr.map(v => `  - ${v}`).join('\n')}`
}

function renderIssue(i) {
  const [agentName] = AGENTS[i.agent]
  const [waveName] = WAVES[i.wave]
  const blocks = blocksOf[i.id] || []
  const st = effStatus(i)
  const as = effAssignee(i)
  const note = ledgerOf(i.id).note
  return `---
id: ${i.id}
title: ${i.title}
wave: ${i.wave}
priority: ${i.priority}
size: ${i.size}
agent: ${i.agent}
status: ${st}
assignee: ${as === null ? 'null' : as}
deps: [${i.deps.join(', ')}]
blocks: [${blocks.join(', ')}]
decisions: [${i.decisions.join(', ')}]
${yamlList('files_own', i.filesOwn)}
${yamlList('files_read', i.filesRead)}
---

# ${i.id} · ${i.title}

> **归属**：${agentName}（\`${i.agent}\`） · **波次**：${waveName} · **优先级**：${i.priority} · **规模**：${i.size}
> **状态**：\`${st}\`${as === null ? '' : ` · **认领人**：\`${as}\``}
> **价值**：${i.value}
${note ? `\n> **进展备注**（来自 \`scripts/issue-status.json\`）：${note}\n` : ''}
## 依赖

| 类型 | 内容 |
|---|---|
| 前置（必须先合并） | ${i.deps.length ? i.deps.map(d => `\`${d}\``).join('、') : '无'} |
| 解锁（本 Issue 合并后） | ${blocks.length ? blocks.map(d => `\`${d}\``).join('、') : '无'} |
| 关联决策 | ${i.decisions.length ? i.decisions.map(d => `\`${d}\``).join('、') : '无'} |

## 背景

${i.bg.map(x => `- ${x}`).join('\n')}

## 范围与实现要点

${i.scope.map((x, n) => `${n + 1}. ${x}`).join('\n')}

## 验收标准

${i.ac.map(x => `- [ ] ${x}`).join('\n')}

## 禁止事项

${i.dont.map(x => `- ⛔ ${x}`).join('\n')}

## 参考

${i.refs.map(x => `- ${x}`).join('\n')}

## 认领与交付

1. **确认可认领**：\`deps\` 全部已 \`done\`，且本卡 \`status\` 为 \`ready\`。用 \`node scripts/gen-issues.mjs --next\` 可直接拿到下一个可认领的 Issue。
2. **锁定**：\`node scripts/gen-issues.mjs --claim ${i.id} <你的 Agent 名>\`，然后提交 \`chore(${i.id}): claim\`。
   **注意**：状态存在 \`scripts/issue-status.json\` 台账里，**不要去改本文件的 frontmatter**（生成物，会被下次生成覆盖）。本卡已丢失过一次手改状态，不要重蹈。
3. **分支**：\`feat/${i.id}-<短描述>\`（前缀按类型改：修复用 \`fix/\`，文档用 \`docs/\`）。
4. **只改** \`files_own\` 列出的文件。需要改他人文件时，在本 Issue 留言说明并等待 owner 合并，**不要直接改**。
5. **自检**：\`bash scripts/ci-check.sh <改动文件...>\`（见 XJ-101），并逐条勾选上方验收标准。
6. **交付**：\`node scripts/gen-issues.mjs --set-status ${i.id} in_review <你的 Agent 名>\`；PR 标题 \`[${i.id}] ${i.title}\`，描述内含「验收自检表」与验证证据（截图 / 命令输出）。
7. **合并后**：\`node scripts/gen-issues.mjs --set-status ${i.id} done\`，解锁下游。

> 项目硬约束（每次提交前自查）：不监听 \`onPageScroll\` 做动效；滚动触发只用 \`uni.createIntersectionObserver\`；动效只动 \`transform\` / \`opacity\`；小程序不支持 CSS \`:hover\` / \`:active\`，按压用 \`hover-class\`；组件内不写皮肤选择器，皮肤 / 档位走继承的自定义属性；乐龄下动效全部降级；合规页不加动效。
`
}

function renderBoard() {
  const lines = []
  lines.push('# Issue 看板 · 雪姬美业互动化改版')
  lines.push('')
  lines.push(`共 **${ISSUES.length}** 个 Issue，按波次编排。每个 Issue 都可被一个 AI Agent 独立认领。`)
  lines.push('')
  const byStatus = Object.fromEntries(STATUSES.map(s => [s, ISSUES.filter(i => effStatus(i) === s).length]))
  const doneN = byStatus.done
  lines.push('## 进度概览')
  lines.push('')
  lines.push(`| 状态 | 数量 | 含义 |`)
  lines.push('|---|---:|---|')
  lines.push(`| \`ready\` | ${byStatus.ready} | 可认领（还需检查 deps 是否已 done） |`)
  lines.push(`| \`claimed\` | ${byStatus.claimed} | 已认领，开发中 |`)
  lines.push(`| \`in_review\` | ${byStatus.in_review} | 已提交，待评审 / 合并 |`)
  lines.push(`| \`done\` | ${byStatus.done} | 已完成并合并 |`)
  lines.push('')
  lines.push(`**完成度：${doneN} / ${ISSUES.length}（${Math.round(doneN / ISSUES.length * 100)}%）** · 状态台账见 \`scripts/issue-status.json\``)
  lines.push('')
  lines.push('## 波次总览')
  lines.push('')
  lines.push('| 波次 | 主题 | Issue 数 | 说明 |')
  lines.push('|---|---|---:|---|')
  for (const [k, [name, desc]] of Object.entries(WAVES)) {
    const list = ISSUES.filter(i => i.wave === k)
    lines.push(`| \`${k}\` | ${name.replace(/^W\d · /, '')} | ${list.length} | ${desc} |`)
  }
  lines.push('')
  lines.push('## Agent 分工')
  lines.push('')
  lines.push('| Agent | 角色 | Issue 数 | 说明 |')
  lines.push('|---|---|---:|---|')
  for (const [g, n] of groups) {
    lines.push(`| \`${g}\` | ${AGENTS[g][0]} | ${n} | ${AGENTS[g][1]} |`)
  }
  lines.push('')
  lines.push('## 依赖关系')
  lines.push('')
  lines.push('```mermaid')
  lines.push('graph LR')
  for (const i of ISSUES) {
    for (const d of i.deps) lines.push(`  ${d} --> ${i.id}`)
  }
  lines.push('```')
  lines.push('')
  for (const [k, [name]] of Object.entries(WAVES)) {
    const list = ISSUES.filter(i => i.wave === k)
    if (!list.length) continue
    lines.push(`### ${name}`)
    lines.push('')
    lines.push('| ID | 状态 | 标题 | Agent | 优先级 | 规模 | 前置 | 决策 |')
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const i of list) {
      const st = effStatus(i)
      const icon = st === 'done' ? '✅ done' : st === 'in_review' ? '🔍 in_review' : st === 'claimed' ? '🚧 claimed' : 'ready'
      lines.push(`| \`${i.id}\` | ${icon} | ${i.title} | \`${i.agent}\` | ${i.priority} | ${i.size} | ${i.deps.map(d => `\`${d}\``).join(' ') || '—'} | ${i.decisions.join(' ') || '—'} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderOwnership() {
  const lines = []
  lines.push('# 文件独占表（多 Agent 并行防冲突）')
  lines.push('')
  lines.push('> 规则：**一个文件在同一时刻只能有一个 Owner**。需要修改他人文件时，先看本表找到 Owner，在对应 Issue 留言申请，由 Owner 合并。')
  lines.push('> 表中的「串行顺序」表示这些 Issue 必须按序合并（同一文件被多次修改）。')
  lines.push('')

  const fileMap = new Map()
  for (const i of ISSUES) {
    for (const f of i.filesOwn) {
      if (!fileMap.has(f)) fileMap.set(f, [])
      fileMap.get(f).push(i.id)
    }
  }

  lines.push('## 1. 共享文件（多方需要 → 必须串行）')
  lines.push('')
  lines.push('| 文件 | Owner 与串行顺序 |')
  lines.push('|---|---|')
  for (const [f, ids] of [...fileMap].filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`| \`${f}\` | ${ids.map((x, n) => `${n + 1}. \`${x}\``).join(' → ')} |`)
  }
  lines.push('')
  lines.push('## 2. 独占文件（可完全并行）')
  lines.push('')
  lines.push('| Issue | Owner Agent | 独占文件 |')
  lines.push('|---|---|---|')
  for (const i of ISSUES) {
    const solo = i.filesOwn.filter(f => fileMap.get(f).length === 1)
    if (!solo.length) continue
    lines.push(`| \`${i.id}\` | \`${i.agent}\` | ${solo.map(f => `\`${f}\``).join('<br>')} |`)
  }
  lines.push('')
  lines.push('## 3. 关键串行点提醒')
  lines.push('')
  lines.push('- `apps/miniapp/src/pages.json`：**不纳入独占管理** —— 它是 `gitignore` 的构建生成物（`apps/miniapp/.gitignore:34`），由各页 `definePage()` 宏经 uni-pages 生成，不在版本控制内。新增路由只需**在自己的页面 `.vue` 里写 `definePage()`**；不要手改、也不要提交该文件。')
  lines.push('- `apps/miniapp/src/style/index.scss`：`XJ-102` → `XJ-103` → `XJ-104` 严格按序；之后页面级 Issue 不得再改该文件（新令牌只能由 ds 追加）。')
  lines.push('- `apps/server/src/controllers/app.controller.ts`：`XJ-302` → `XJ-303` → `XJ-304` 严格按序（同一个 936 行的控制器文件，多人同时改必然冲突）。`XJ-305` 只改 `home.service.ts`，与前三者无文件冲突，但需等 `XJ-302` 冻结数据契约。')
  lines.push('- `apps/miniapp/src/components/home/HomeRender.vue`：`XJ-201` → `XJ-202` → `XJ-203` 严格按序。')
  lines.push('- `apps/miniapp/src/icons/graphics/**` 与 `uno.config.ts`：`XJ-104` → `XJ-601` → `XJ-602`（图形资源三层必须保持一致）。')
  return lines.join('\n')
}

function renderReadme() {
  return `# 雪姬美业 · Issue 包使用说明

本目录由 \`scripts/gen-issues.mjs\` 生成，**不要手工编辑 Issue 正文**（改数据源后重新生成即可）。

## 目录内容

| 文件 | 用途 |
|---|---|
| \`README.md\` | 本文件：Agent 认领协议 |
| \`BOARD.md\` | 看板：波次、Agent 分工、依赖图、逐 Issue 索引 |
| \`OWNERSHIP.md\` | 文件独占表（多 Agent 并行防冲突的**唯一依据**） |
| \`DECISIONS.md\` | 21 项决议（**全部已定稿，无待定项**） |
| \`issues.json\` | 机器可读索引，供 Agent 自动筛选 |
| \`XJ-*.md\` | 单张 Issue 卡片 |
| \`../scripts/issue-status.json\` | **执行进度台账**（status / assignee / note），用 \`--claim\` / \`--set-status\` 读写 |

> **决策门已定稿**：\`XJ-000\` 状态为 \`done\`，21 项决议全部为「✅ 已定」。
> Agent 遇到决议未覆盖的边界情况时，按 \`DECISIONS.md\` 的「决议理由」自行裁量并在 PR 中说明，**不要停下来等确认**。
> \`issues.json\` 的 \`decisionSummary.pending\` 恒为 \`0\`。

## 为什么拆成 Issue

设计文档（\`docs/06\` ~ \`docs/09\`）是**给人看的**，Issue 是**给 Agent 执行用的**。每张卡都自带：

- 精确到文件的写入边界（\`files_own\`）与只读参考（\`files_read\`）
- 明确的依赖与解锁关系（避免并发等待）
- 可勾选的验收标准（可被机器或人逐条判定）
- 禁止事项（把踩过的坑固化成约束）

## Agent 认领流程

状态存在 \`scripts/issue-status.json\` 台账里（\`status\` / \`assignee\` / \`note\`），
**不要手改 \`issues/*.md\` 的 frontmatter**——那是生成物，下次生成就没了。

\`\`\`bash
# 1. 拿下一个可认领的 Issue（自动跳过 deps 未完成的）
node scripts/gen-issues.mjs --next

# 2. 认领（会把状态置 claimed 并写台账；前置未完成会被拒）
node scripts/gen-issues.mjs --claim XJ-101 infra-agent
git add scripts/issue-status.json issues/ && git commit -m "chore(XJ-101): claim"

# 3. 建分支
git checkout -b feat/XJ-101-ci-check

# 4. 开发（只改 files_own 列出的文件）

# 5. 自检
bash scripts/ci-check.sh <你改动的文件列表>

# 6. 提交，置 in_review
node scripts/gen-issues.mjs --set-status XJ-101 in_review infra-agent
#    PR 标题：[XJ-101] 工程基建：构建与校验脚本化、CI 入口
#    PR 描述：粘贴 Issue 的「验收标准」并逐条勾选 + 验证证据

# 7. 合并后置 done，解锁下游
node scripts/gen-issues.mjs --set-status XJ-101 done
\`\`\`

> 进度速查：\`node scripts/gen-issues.mjs --check\` 会打印各状态数量；\`issues/BOARD.md\` 有完成度概览。

## 并行策略

- **优先认领路径**：\`XJ-101\`（基建，全员依赖，工期最短）→ \`XJ-102\`（令牌）→ \`XJ-105\`（小镜形象）→ \`XJ-106\`（路由预登记）。这 4 个是解锁下游最多的节点。
- **可安全并行的组合**：\`ds\` 做 W1 地基的同时，\`be\` 可以并行做 \`XJ-301\` / \`XJ-302\`（互不碰同一文件）。
- **必须排队**：同一文件被多个 Issue 写入时，严格按 \`OWNERSHIP.md\` 的串行顺序合并。
- **不要跨波次抢跑**：W4 的页面 Issue 依赖 W3 的接口契约，接口未冻结前开工会导致返工。

## 状态流转

\`\`\`
ready ──(认领)──> claimed ──(提交 PR)──> in_review ──(合并)──> done
                    │
                    └──(放弃/阻塞)──> ready（并留言说明原因）
\`\`\`

## 发现 Issue 有问题怎么办

不要直接改 Issue 正文。在 \`XJ-000\` 下留言，由 \`pm\` Agent 更新数据源并重新生成。

## 校验

\`node scripts/gen-issues.mjs --check\` 会校验：依赖成环、悬空依赖、文件独占冲突、生成结果与磁盘一致。
`
}

function renderDecisions() {
  const lines = []
  lines.push('# 决策门 · 21 项决议（全部已定稿）')
  lines.push('')
  lines.push('> **本 Issue 包不保留任何待定项。** 下表 21 项已全部定稿，Agent 直接执行，不需要等待用户拍板，也不需要「按推荐默认值」这类假设。')
  lines.push('> 其中 `D1`~`D18` 为原「18 项待拍板事项」，`D19`~`D21` 为 `docs/06 §7` 遗留的 3 项，均已一并定稿。')
  lines.push('')
  lines.push('| 编号 | 事项 | 最终决议 | 影响 Issue | 状态 |')
  lines.push('|---|---|---|---|---|')
  for (const x of DECISIONS) {
    lines.push(`| \`${x.id}\` | ${x.q} | ${x.d} | ${x.issues.map(i => `\`${i}\``).join(' ')} | ✅ 已定 |`)
  }
  lines.push('')
  lines.push('## 决议理由（边界情况按此裁量）')
  lines.push('')
  lines.push('Agent 遇到决议未覆盖的边界情况时，按下列理由自行裁量并在 PR 中说明，**不要停下来等确认**。')
  lines.push('')
  for (const x of DECISIONS) lines.push(`- **\`${x.id}\`** ${x.why}`)
  lines.push('')
  lines.push('## 阻塞等级说明')
  lines.push('')
  lines.push(`**零待定项**：21 项全部为已定决议，${ISSUES.length} 个 Issue 中没有任何一个因决策问题等待。`)
  lines.push('')
  lines.push('其中对开发节奏影响最大的三项：')
  lines.push('')
  lines.push('1. **D1** 决定首页任务卡的数据来源 —— 影响 `XJ-201` 与 `XJ-305`，是本轮最高频页面。')
  lines.push('2. **D6** 决定 A 级是否全站夜色金 —— 影响 `XJ-202` 与 `XJ-204`，改动面覆盖 49 个页面。')
  lines.push('3. **D15** 决定后端图标枚举 —— `D14` 的 `.ic-chip` 彩色化必须与其同批上线，否则未命中的图标会显示空白。')
  lines.push('')
  lines.push('## 不在本决策门范围内的待办项')
  lines.push('')
  lines.push('以下两类**不是设计决策**，因此不纳入本表，也不影响本 Issue 包开工：')
  lines.push('')
  lines.push('- `docs/01` 原始稿（v1.0）中的历史待确认标记：仅作存档，不再维护。')
  lines.push('- `docs/02 §10` 的 `Q19`~`Q26`：属**客户侧**待提供材料（门店电话 / AppID / 域名与 ICP 备案 / 大模型 API Key / 项目属性与法务审核），由雪姬美业、商学院与法务推进，不阻塞开发。')
  lines.push('')
  lines.push('## 决议变更流程')
  lines.push('')
  lines.push('决议一旦变更即属**设计变更**，按三步走，不要直接手改生成物：')
  lines.push('')
  lines.push('1. 在 `XJ-000` 提变更说明（原因 + 影响面 + 是否影响已合并代码）。')
  lines.push('2. 更新 `scripts/gen-issues.mjs` 的 `DECISIONS` 数组（**唯一数据源**）。')
  lines.push('3. `node scripts/gen-issues.mjs` 重新生成本目录，并按「影响 Issue」逐张回改。')
  return lines.join('\n')
}

async function checkCycles() {
  const errors = []
  for (const i of ISSUES) {
    for (const d of i.deps) {
      if (!allIds.has(d)) errors.push(`悬空依赖：${i.id} 依赖不存在的 ${d}`)
    }
  }
  const state = {}
  const dfs = (id, path) => {
    if (state[id] === 'doing') { errors.push(`依赖成环：${[...path, id].join(' → ')}`); return }
    if (state[id] === 'done') return
    state[id] = 'doing'
    const node = ISSUES.find(x => x.id === id)
    for (const d of node?.deps || []) dfs(d, [...path, id])
    state[id] = 'done'
  }
  for (const i of ISSUES) dfs(i.id, [])

  const fmOwner = new Map()
  for (const i of ISSUES) {
    for (const f of i.filesOwn) {
      if (!fmOwner.has(f)) fmOwner.set(f, [])
      fmOwner.get(f).push(i.id)
    }
  }
  for (const [f, ids] of fmOwner) {
    if (new Set(ids).size !== ids.length) errors.push(`文件被同一 Issue 重复声明：${f}`)
  }
  const dupes = ISSUES.map(i => i.id).filter((id, n, a) => a.indexOf(id) !== n)
  if (dupes.length) errors.push(`重复的 Issue ID：${dupes.join(', ')}`)

  /* ── 决策一致性：编号唯一、引用存在、双向镜像、零待定 ── */
  const decIds = new Set(DECISIONS.map(x => x.id))
  const dupDec = DECISIONS.map(x => x.id).filter((id, n, a) => a.indexOf(id) !== n)
  if (dupDec.length) errors.push(`重复的决策编号：${dupDec.join(', ')}`)
  if (DECISIONS.some(x => x.status && x.status !== 'decided')) errors.push('存在未定稿的决策（status != decided）')

  for (const x of DECISIONS) {
    if (!x.q || !x.d || !x.why) errors.push(`决策 ${x.id} 缺少事项 / 决议 / 理由`)
    for (const id of x.issues) if (!allIds.has(id)) errors.push(`决策 ${x.id} 引用了不存在的 Issue：${id}`)
  }
  for (const i of ISSUES) {
    for (const d of i.decisions) if (!decIds.has(d)) errors.push(`Issue ${i.id} 引用了不存在的决策：${d}`)
  }
  // 双向镜像：DECISIONS 列出的 Issue 必须回指该决策（决策门总卡 XJ-000 除外）
  const GATE = 'XJ-000'
  for (const x of DECISIONS) {
    for (const id of x.issues) {
      const node = ISSUES.find(t => t.id === id)
      if (node && !node.decisions.includes(x.id)) errors.push(`决策双向不一致：${x.id} 影响 ${id}，但 ${id} 未声明 ${x.id}`)
    }
  }
  for (const i of ISSUES) {
    if (i.id === GATE) continue
    for (const d of i.decisions) {
      const x = DECISIONS.find(t => t.id === d)
      if (x && !x.issues.includes(i.id)) errors.push(`决策双向不一致：${i.id} 受 ${d} 约束，但 ${d} 未列出 ${i.id}`)
    }
  }

  /* ── 状态台账一致性 ── */
  for (const i of ISSUES) {
    const st = effStatus(i)
    if (!STATUSES.includes(st)) errors.push(`Issue ${i.id} 状态非法：${st}（允许 ${STATUSES.join(' / ')}）`)
    if (st !== 'ready' && !effAssignee(i)) errors.push(`Issue ${i.id} 状态为 ${st} 但台账未填 assignee`)
  }
  for (const id of Object.keys(LEDGER.entries)) {
    if (!allIds.has(id)) errors.push(`状态台账里存在不存在的 Issue：${id}`)
  }

  return { errors, fileMap: fmOwner }
}

/* ───────────────────── 流水线命令（供每小时定时任务调用） ───────────────────── */

/** 可认领 = 状态 ready 且 deps 全部 done；排序：波次 → 优先级 → ID */
function claimable() {
  const waveOrder = Object.keys(WAVES)
  const st = Object.fromEntries(ISSUES.map(i => [i.id, effStatus(i)]))
  return ISSUES
    .filter(i => effStatus(i) === 'ready' && i.deps.every(d => st[d] === 'done'))
    .sort((a, b) =>
      waveOrder.indexOf(a.wave) - waveOrder.indexOf(b.wave)
      || (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function printNext() {
  const list = claimable()
  if (!list.length) {
    const pend = ISSUES.filter(i => effStatus(i) !== 'done')
    console.log('⏳ 当前没有可认领的 Issue。')
    console.log(`   未完成 ${pend.length} 个：${pend.map(i => `${i.id}:${effStatus(i)}`).join(' ')}`)
    if (pend.length) {
      const blocked = pend.filter(i => i.deps.some(d => effStatus(ISSUES.find(t => t.id === d)) !== 'done'))
      if (blocked.length)
        console.log(`   其中被前置阻塞：${blocked.map(i => `${i.id}(等 ${i.deps.filter(d => effStatus(ISSUES.find(t => t.id === d)) !== 'done').join(' ')}）`).join('、')}`)
    }
    return
  }
  const n = list[0]
  console.log('▶ 下一个可认领的 Issue')
  console.log(`   ID          ${n.id}`)
  console.log(`   标题        ${n.title}`)
  console.log(`   波次         ${n.wave} · 优先级 ${n.priority} · 规模 ${n.size}`)
  console.log(`   建议 Agent   ${n.agent}（${AGENTS[n.agent][0]}）`)
  console.log(`   前置         ${n.deps.join(' ') || '无'}`)
  console.log(`   关联决策     ${n.decisions.join(' ') || '无'}`)
  console.log(`   建议分支     feat/${n.id}-<短描述>`)
  console.log('   独占文件（只能改这些）：')
  for (const f of n.filesOwn) console.log(`     - ${f}`)
  console.log(`   认领命令     node scripts/gen-issues.mjs --claim ${n.id} <Agent 名>`)
  console.log(`   同期可认领共 ${list.length} 个：${list.slice(0, 8).map(i => i.id).join(' ')}${list.length > 8 ? ' …' : ''}`)
}

function parseStatusChange(argv) {
  const c = argv.indexOf('--claim')
  if (c >= 0) return { id: argv[c + 1], status: 'claimed', assignee: argv[c + 2] }
  const s = argv.indexOf('--set-status')
  if (s >= 0) return { id: argv[s + 1], status: argv[s + 2], assignee: argv[s + 3] }
  return null
}

function applyStatusChange(change) {
  const node = ISSUES.find(i => i.id === change.id)
  if (!node) return `不存在的 Issue：${change.id}`
  if (!STATUSES.includes(change.status)) return `非法状态：${change.status}（允许 ${STATUSES.join(' / ')}）`

  if (change.status === 'claimed') {
    const notDone = node.deps.filter(d => effStatus(ISSUES.find(t => t.id === d)) !== 'done')
    if (notDone.length) return `${change.id} 的前置尚未完成（${notDone.join(' ')}），不能认领——先做前置`
  }
  const assignee = change.assignee ?? LEDGER.entries[change.id]?.assignee ?? null
  if (change.status !== 'ready' && !assignee) return `置为 ${change.status} 需要指定 assignee`

  LEDGER.entries[change.id] = {
    ...(LEDGER.entries[change.id] || {}),
    status: change.status,
    assignee,
    updatedAt: new Date().toISOString(),
  }
  console.log(`✅ ${change.id} → ${change.status}${assignee ? `（${assignee}）` : ''}`)
  return null
}

async function main() {
  const argv = process.argv.slice(2)
  const { errors, fileMap } = await checkCycles()

  if (errors.length) {
    console.error('❌ 校验失败：')
    for (const e of errors) console.error('   -', e)
    process.exit(1)
  }

  if (argv.includes('--check')) {
    const byStatus = Object.fromEntries(STATUSES.map(s => [s, ISSUES.filter(i => effStatus(i) === s).length]))
    console.log(`✅ 校验通过：${ISSUES.length} 个 Issue，依赖无环、无悬空引用、无重复 ID、决策双向一致`)
    console.log(`   独占文件 ${fileMap.size} 个，其中共享文件 ${[...fileMap.values()].filter(v => v.length > 1).length} 个（需串行）`)
    console.log(`   状态：done ${byStatus.done} / in_review ${byStatus.in_review} / claimed ${byStatus.claimed} / ready ${byStatus.ready}`)
    return
  }

  const change = parseStatusChange(argv)
  if (change) {
    const err = applyStatusChange(change)
    if (err) {
      console.error(`❌ ${err}`)
      process.exit(1)
    }
    await saveLedger()
  }

  if (argv.includes('--next')) {
    printNext()
    if (!change) return
  }

  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  for (const i of ISSUES) {
    await writeFile(join(OUT, `${i.id}.md`), renderIssue(i), 'utf8')
  }
  await writeFile(join(OUT, 'BOARD.md'), renderBoard(), 'utf8')
  await writeFile(join(OUT, 'OWNERSHIP.md'), renderOwnership(), 'utf8')
  await writeFile(join(OUT, 'README.md'), renderReadme(), 'utf8')
  await writeFile(join(OUT, 'DECISIONS.md'), renderDecisions(), 'utf8')
  await writeFile(join(OUT, 'issues.json'), `${JSON.stringify({
    generatedFrom: 'scripts/gen-issues.mjs',
    statusLedger: 'scripts/issue-status.json',
    total: ISSUES.length,
    waves: Object.fromEntries(Object.entries(WAVES).map(([k, v]) => [k, v[0]])),
    agents: Object.fromEntries(Object.entries(AGENTS).map(([k, v]) => [k, v[0]])),
    issues: ISSUES.map(i => ({
      id: i.id,
      title: i.title,
      wave: i.wave,
      priority: i.priority,
      size: i.size,
      agent: i.agent,
      status: effStatus(i),
      assignee: effAssignee(i),
      note: ledgerOf(i.id).note || '',
      deps: i.deps,
      blocks: blocksOf[i.id] || [],
      decisions: i.decisions,
      filesOwn: i.filesOwn,
      filesRead: i.filesRead,
      acCount: i.ac.length,
    })),
    progress: (() => {
      const byStatus = Object.fromEntries(STATUSES.map(s => [s, ISSUES.filter(i => effStatus(i) === s).length]))
      return { ...byStatus, total: ISSUES.length, nextClaimable: claimable().slice(0, 5).map(i => i.id) }
    })(),
    decisions: DECISIONS.map(x => ({
      id: x.id,
      question: x.q,
      decision: x.d,
      why: x.why,
      issues: x.issues,
      status: 'decided',
    })),
    decisionSummary: { total: DECISIONS.length, decided: DECISIONS.length, pending: 0 },
  }, null, 2)}\n`, 'utf8')

  const written = (await readdir(OUT)).filter(f => f.endsWith('.md'))
  console.log(`✅ 已生成 ${written.length} 个文件到 issues/`)
  console.log(`   Issue 卡片 ${ISSUES.length} 张`)
  for (const [g, n] of groups) console.log(`   · ${g.padEnd(6)} ${n} 个`)
  console.log(`   共享文件（需串行）${[...fileMap.values()].filter(v => v.length > 1).length} 个`)
}

main()
