# TIRE-M3 · 救援咨询表单（小程序 tabbar 页 /pages/consult/index）

目标：司机详述故障（车牌/车型/位置/描述/图片/联系方式）提交，平台客服电话跟进。

## 文件所有权
- apps/miniapp/src/pages/consult/index.vue（tabbar 页，桩已建）

## 功能需求
1. 表单字段（.card 卡片分组）：
   - 车辆信息：车牌号（input，placeholder「如 豫A8K2F6」）、车型（input「如 解放J6 重卡 / 大众迈腾」）
   - 当前位置：自动获取（uni.getLocation，进入页面尝试）显示「已定位」，失败可手动点按钮重试 + 手动输入位置描述 input
   - 故障描述：textarea（必填，placeholder 示例「右前轮爆胎，车满载在高速应急车道」）
   - 现场照片：最多 6 张；uni.chooseImage → uploadImage(tempFilePath) 逐张上传（上传中 loading），缩略图九宫格可删除
   - 联系方式：姓名（必填）、手机号（必填 /^1\d{10}$/）
2. 提交按钮（.btn-primary 大按钮）：校验（必填项红字提示/toast）→ POST /app/consult（images 传已上传的 url 数组）→ 成功弹窗「已提交，平台客服将尽快与您联系」→ 清空表单
3. 已登录用户自动预填姓名/手机号（useTire().me）
4. 游客可提交（后端 OptionalAuth），登录则自动关联

## 验收标准
- H5 完整提交一条咨询；curl 后台 /admin/consults（需 admin token）能看到新工单与图片
- 校验：空描述/坏手机号被拦；图片可删可传
- 定位失败不阻塞提交（手动描述兜底）

## 自测步骤
填表 → 传 2 图 → 提交 → 后台咨询工单出现 → 清空表单 → 再提交一条仅必填项
