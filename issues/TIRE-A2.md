# TIRE-A2 · 门店管理（后台）

目标：门店信息完全由后台录入维护；真实地址/电话仅后台可见（端上模糊展示）。

## 文件所有权
- apps/admin/src/views/tire/store/**

## 功能需求
1. **列表**：storeList 分页表格，列：门店名称、分类（STORE_CATEGORIES 字典 + el-tag）、评分（星星或数字）、主营项目、模糊区域、排序值、状态（active 展示中/hidden 已隐藏 tag）、更新时间；右上名称搜索 + 分类下拉筛选 + 状态筛选
2. **新增/编辑**（弹窗或抽屉表单）：名称*、分类*（下拉字典）、主营项目、评分（el-input-number 0-5 步进 0.1）、纬度*、经度*（数字输入，附提示文案「可在坐标拾取器网站（如 lbs.qq.com/getPoint）取点后粘贴」）、完整地址、联系电话、联系人、模糊区域名（placeholder 示例「高新区」）、排序权重；提交调 storeCreate / storeUpdate
3. 经纬度非法值（越界/非数字）前端拦截（lat -90~90，lng -180~180），给出明确提示
4. **状态启停**：行内 el-switch 直接调 storeUpdate({status})
5. **删除**：ElMessageBox 确认后 storeDelete；提示「已有浏览记录的门店删除后将转为隐藏」

## 验收标准
- CRUD 全流程可用；编辑回显正确
- 新建一家门店后，curl http://localhost:8850/api/v1/app/stores 能看到模糊字段但无地址电话
- 经纬度输入 999 保存被拦

## 自测步骤
新增门店（含经纬度）→ 列表出现 → 编辑改评分 → 停用后端上列表消失 → 删除
