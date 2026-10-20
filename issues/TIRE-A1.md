# TIRE-A1 · 工作台 Dashboard（后台）

目标：登录后默认页 /dashboard，平台运营一眼看清今日业务与待处理事项。

## 文件所有权（只能动这些）
- apps/admin/src/views/tire/dashboard/**（index.vue 已是桩，可拆子组件放同目录）

## 功能需求
1. **统计卡片区**（6 张卡，调 dashboardStats）：今日救援、今日咨询、待处理救援、待处理咨询、司机总数、门店总数；待处理两类用警示色（danger）突出
2. **最新待处理列表**：左「待处理救援」右「待处理咨询」两栏（或 tab），各取前 5 条（rescueList({status:'pending',pageSize:5}) / consultList({status:'pending',pageSize:5})），行点击跳转 /tire/rescue 或 /tire/consult（router.push）
3. **近 7 天趋势图**：dashboardStats().trend 折线/柱状图（救援、咨询两条系列，ECharts）
4. 30 秒自动刷新统计数据（onUnmounted 清定时器）

## 验收标准
- 登录后默认进入且数据与 seed 一致（今日救援≥1、待处理≥1）
- 空数据不报错（trend 全 0 时图表空态）
- 跳转链接正确；卡片布局自适应（el-row/el-col 响应式）

## 自测步骤
登录 → 工作台看到卡片与图表 → 点待处理行跳转对应页 → Network 面板确认仅 30s 轮询一次 stats
