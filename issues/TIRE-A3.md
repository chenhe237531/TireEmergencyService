# TIRE-A3 · 救援通知 + 咨询工单（后台核心业务）

目标：司机端「故障找救援」与「服务咨询表单」都汇集到后台，运营人员电话跟进并记录。

## 文件所有权
- apps/admin/src/views/tire/rescue/**
- apps/admin/src/views/tire/consult/**

## 通用约定
工单状态机（后端已严格校验，前端用 statusFlow 做按钮可用性）：pending 待处理 → contacting 跟进中 → resolved 已解决 / cancelled 已取消；已终态不可变更。statusTag 映射 el-tag 颜色。

## 救援通知页 /tire/rescue
1. 状态 tab（全部/待处理/跟进中/已解决/已取消）+ 日期范围筛选（el-date-picker daterange → start/end YYYY-MM-DD）+ 分页
2. 列：通知编号、司机（昵称+手机号，可直接点击拨号 tel: 链接或复制）、身份（driverRoleName）、位置描述、坐标、状态 tag、跟进备注、处理人、时间
3. 行操作：**一键拨打电话**（window.location.href='tel:...'）、**处理**（弹窗：状态流转下拉（按 statusFlow 当前态可选值）+ 备注文本域，调 rescueHandle）
4. **未读提醒**：进入页面启动 30s 轮询 rescueUnreadCount()；有待处理时页面顶部显示红色警示条「当前待处理 N 条救援通知」（数据变化时 ElNotification 提示一次，onUnmounted 清理定时器）

## 咨询工单页 /tire/consult
1. 状态 tab + 关键字搜索（姓名/手机号/车牌）+ 日期范围 + 分页
2. 列：编号、车牌、车型、联系人+电话（可拨号）、位置、故障描述（截断+tooltip）、图片数、状态、时间
3. **详情抽屉**（el-drawer，consultDetail）：完整表单信息、图片九宫格（el-image preview-src-list，src 用 fileUrl()）、故障描述全文、司机账号信息（driverId 有则显示）、处理区（状态流转+备注，consultHandle）

## 验收标准
- 状态流转按状态机：待处理可直接「已解决」；「已解决」后操作按钮全部禁用
- 轮询角标/警示条出现；图片可预览放大
- seed 里已有 1 条 pending 救援与 1 条 pending 咨询可直接测

## 自测步骤
救援页处理一条 pending（转跟进中+写备注）→ 咨询页打开详情抽屉看图 → 非法流转按钮不可点
