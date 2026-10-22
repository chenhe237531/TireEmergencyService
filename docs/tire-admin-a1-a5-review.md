# 后台 A1–A5 集成检查报告

本文件记录 TIRE-A1 ~ TIRE-A5 五个后台任务合并后的整体检查结论，以及仍需优化的地方与改进建议。

## 一、交付范围

| 任务 | 分支 | 页面 | 关键文件 |
|---|---|---|---|
| A1 | `feat/TIRE-A1-dashboard` | 工作台 `/dashboard` | `views/tire/dashboard/**` |
| A2 | `feat/TIRE-A2-store` | 门店管理 `/tire/store` | `views/tire/store/**` |
| A3 | `feat/TIRE-A3-rescue-consult` | 救援通知 `/tire/rescue`、咨询工单 `/tire/consult` | `views/tire/rescue/**`、`views/tire/consult/**` |
| A4 | `feat/TIRE-A4-driver-viewlog` | 司机管理 `/tire/driver`、浏览痕迹 `/tire/viewlog` | `views/tire/driver/**`、`views/tire/viewlog/**` |
| A5 | `feat/TIRE-A5-setting-faq` | 平台设置 `/tire/setting`、常见问题 `/tire/faq` | `views/tire/setting/**`、`views/tire/faq/**` |

五个任务各自在独立 worktree + 独立分支开发，逐条 `--no-ff` 合并到集成分支 `feat/tire-admin-a1-a5`。

## 二、主控统一修复的阻塞问题

这些问题各任务单看都正常，但合并到主分支后暴露，属于共享契约层缺陷，由主控统一修复：

1. **路由父子同路径导致页面全白**（`router/modules/tire-*.ts`）
   父级与子级 `path` 相同，子路由永远无法胜出；`tire-driver.ts` 还存在 `redirect` 自指，触发 `RangeError: Maximum call stack size exceeded`。
   修复：父级改为唯一分组路径 + `redirect` 到首个子页，子路由保留原绝对路径，URL 与菜单不变。

2. **图片上传必然失败**（`api/tire.ts`）
   axios 默认 `application/json`，会把 `FormData` 序列化成 `{}`，后端固定报「请选择要上传的图片」。
   修复：`uploadImage` 显式声明 `Content-Type: multipart/form-data`。

3. **`el-table` 插槽类型不兼容**（18 处 `vue-tsc` 报错）
   插槽 `row` 静态类型是 `DefaultRow`，不能直接赋给业务类型。修复：各页新增 `asStore/asDriver/asConsult/asRescue/asFaq(row)` 断言；`el-tag` 的 `type` 收敛为 `TagType` 联合类型。

4. **表格列宽总和超出容器被等比压缩**
   `el-table` 在列宽总和大于容器时会把所有列（含固定宽度列）等比压缩，救援页「时间」被截成 `2026-10-`、咨询页「状态」标签被切断。
   修复：按内容重排列宽（时间 148、状态 88、编号 56），控制总宽不超过内容区。

5. **新增门店后看不见**
   新建门店 `sort=0` 排到最后一页，用户以为保存失败。修复：新增后按名称回查并重置到第一页。

## 三、验证结果

| 项目 | 方式 | 结果 |
|---|---|---|
| 页面冒烟 | Playwright 注入登录态逐页打开，收集 console 错误与接口失败 | 8 个路由全部 `consoleErrors: []`、`failedRequests: []` |
| 端到端 | 12 步跨页流程（工作台卡片跳转、门店增删改校验、救援状态机、咨询抽屉、司机→痕迹联动、设置保存后刷新保持、FAQ 增删） | 12/12 通过 |
| 类型检查 | `vue-tsc --noEmit --skipLibCheck` | 仅剩 2 个基线既有错误，见下 |
| 代码规范 | `eslint src/views/tire/**/*.vue src/api/tire.ts` | 0 error / 0 warning |
| 构建 | `pnpm --filter tire-admin build` | 成功，有体积告警 |

## 四、仍需优化的地方与改进建议

### P1 · 建议下一轮处理

1. **ECharts 全量引入导致首屏体积过大**
   构建产物中 `TrendChart` 分块 1.13 MB（gzip 379 KB），因为整包引入 `echarts`。
   建议改为 `echarts/core` + 按需注册 `LineChart`、`GridComponent`、`TooltipComponent`、`CanvasRenderer`，预计可降到 300 KB 以内。

2. **司机「身份未完善」筛选靠前端过滤且被截断**
   `GET /admin/drivers` 不支持 `role=empty`，A4 只能先取 200 条再在前端筛，数据量上来会漏。
   建议后端补 `role` 枚举值（含 `empty`），前端改为服务端筛选。

3. **FAQ 缺 `updatedAt` 字段**
   `FaqItem` 只有 `createdAt`，列表「更新时间」实际展示的是创建时间，编辑后不会变化，语义错误。
   建议后端补 `updatedAt`（Prisma `@updatedAt`）并同步 DTO；短期至少把列标题改为「创建时间」。

4. **列表筛选条件不持久化**
   除浏览痕迹（用 URL query 回填）外，其余列表刷新后筛选与分页全部丢失。
   建议抽出 `useTableQuery()`：把 `page/pageSize/keyword/status/dateRange` 同步到 URL query，`onMounted` 回填。

5. **轮询缺少可见性判断，存在双通道重复请求**
   工作台 30s 全量刷新 + 救援页 30s 待处理计数轮询；标签页切到后台仍在请求。
   建议抽 `usePolling(fn, interval)`，内部判断 `document.visibilityState === "visible"`，并在 `onDeactivated` 统一停表（keepAlive 场景）。

6. **重复代码待收敛**
   `formatTime`、`tagType`、`ORDER_STATUS`、`asXxx`、分页对象几乎每页各写一份。
   建议新增 `src/utils/tire.ts`（格式化 + 字典）与 `src/composables/useTablePage.ts`，五个页面统一引用。

### P2 · 质量与体验

7. **表格列宽硬编码**
   本次按 1440 视口内容区（约 1142 px）调优，1366 笔记本上仍会被压缩。
   建议关键列改 `min-width` + `show-overflow-tooltip`，或引入列显隐/密度设置，避免再加列就截断。

8. **按钮级权限缺失**
   目前只有路由级 `meta.roles` 过滤，ops 角色进入门店页后仍能看到「删除」。
   建议补 `v-auth` 指令或 `hasPerm()` 判断，后端同步做接口鉴权校验。

9. **设置页缺少关闭页面兜底**
   只有 `onBeforeRouteLeave` 脏检查，直接关标签页/刷新不会提示。
   建议补 `beforeunload` 监听（有改动时 `preventDefault`）。

10. **上传仅前端校验**
    2 MB 与图片类型只在浏览器校验，后端限制未知；`/uploads` 目录只增不清理。
    建议后端加 multer 限制与定时清理策略，前端补失败重试与进度提示。

11. **空态与加载态不统一**
    部分表格用 `empty-text`，部分自定义插槽；骨架屏缺失。
    建议抽 `EmptyState`（图标 + 文案 + 主行动按钮）与列表骨架组件。

12. **门删除语义需与后端对齐**
    前端提示「已有浏览记录的门店删除后将转为隐藏」，需确认 `DELETE /admin/stores/:id` 实际是软删除还是硬删除，避免提示与行为不一致。

13. **批量操作缺失**
    门店、司机、FAQ 均无批量启用/停用/删除，运营量大时效率低。

14. **救援页「立即处理」不定位记录**
    点击后只切到待处理 tab，未滚动/高亮到最新一条，建议加定位与短暂高亮。

### P3 · 工程化

15. **基线类型错误未清**
    `mock/placeholder.ts` 的 `defineMock` 未声明、`ReIcon/src/iconifyIconOffline.ts` 的 `object` 不能赋给 `string`，属于模板既有问题，建议单独修一次，让 `vue-tsc` 归零以便接入 CI 卡口。

16. **E2E 未入库**
    本次验证脚本是临时的（未提交）。建议落到 `e2e/` 并接入 CI，覆盖登录、各列表 CRUD、状态机流转。

17. **共享文件改动流程**
    `api/tire.ts`、`router/modules/*` 属于多任务共享，并行开发时必然冲突。建议这类文件由主控先单独 PR 合入，再让任务分支 rebase。

18. **`.worktrees/` 忽略规则**
    目前写在 `.git/info/exclude`（只对本机生效），团队协作应写入 `.gitignore`。

## 五、2026-10-22 修复状态

本轮已处理：

- 生产 mock 注入导致白屏：`vitePluginFakeServer.enableProd` 改为 `false`，并补 `defineMock` 类型声明。
- FAQ 补 `updatedAt`（含历史数据默认值），列表改展示真实更新时间。
- 司机「未完善身份」改为服务端 `role=empty` 筛选，不再前端截断。
- 后台权限落地：删除门店/FAQ、平台设置仅 `super_admin`；运营仍可处理工单、维护门店与 FAQ 内容。
- 上传接口补 5MB multer 限制；后台设置直接刷新/关闭页面时补 `beforeunload` 提醒。
- ECharts 改为按需注册，趋势图分块从约 1.13 MB 降到约 517 KB。
- `.worktrees/` 已写入 `.gitignore`。

仍未处理（P2/P3）：列表筛选条件 URL 持久化、批量操作、统一空态/骨架、E2E 入库、上传文件清理策略。
