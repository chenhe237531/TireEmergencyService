# TIRE-A4 · 司机管理 + 浏览痕迹（后台）

目标：查看注册司机、以及他们对门店的浏览/点击痕迹（平台据此判断意向、主动线下对接）。

## 文件所有权
- apps/admin/src/views/tire/driver/**
- apps/admin/src/views/tire/viewlog/**

## 司机管理页 /tire/driver
1. driverList 分页表格：头像（el-avatar，src 用 fileUrl 不适用则空占位——头像存的是微信 URL 或空）、昵称、手机号、身份（DRIVER_ROLES，未完善显示灰 tag）、注册时间、最近登录
2. 搜索：关键字（昵称/手机号）+ 身份下拉
3. 行操作「查看痕迹」：router.push('/tire/viewlog?driverId=' + row.id)

## 浏览痕迹页 /tire/viewlog
1. viewLogList 分页表格：时间、司机（昵称+手机号）、门店（名称+分类）、动作（曝光/点击，click 用品牌色 tag）
2. 筛选：司机（输入 id 或做简单下拉——可直接数字输入框）、门店（同）、动作、日期范围
3. **联动**：从司机管理跳转来时（route.query.driverId）自动填入筛选并触发查询
4. 空态提示「司机在小程序端浏览/点击门店后，痕迹会出现在这里」

## 验收标准
- seed 有 3 条痕迹（含 1 条 click），列表可查
- 司机页点「查看痕迹」跳转后筛选自动带上
- 分页与筛选组合正确（清空筛选恢复全量）

## 自测步骤
司机列表搜索 13800001111 → 查看痕迹 → 只见该司机记录 → 切动作筛选 click
