# TIRE-A5 · 平台设置 + FAQ 管理（后台）

目标：维护端上「联系客服/关于我们/协议/常见问题」展示的全部内容。

## 文件所有权
- apps/admin/src/views/tire/setting/**
- apps/admin/src/views/tire/faq/**

## 平台设置页 /tire/setting
1. getSettings 读取，表单分组卡片：
   - **客服**：客服电话（必填校验）、客服二维码（图片上传：el-upload 自定义 http-request 调 uploadImage(file)，回显 el-image，可删除清空 wechatQr）
   - **文案**：分享文案 shareTitle、关于我们 about（textarea 多行）
   - **协议**：用户协议 userAgreement、隐私政策 privacyPolicy（textarea，高度大些；提示「\n 换行生效」）
2. 保存按钮 → saveSettings；成功 ElMessage；离开未保存提示（可选）

## FAQ 管理页 /tire/faq
1. faqList 表格：排序值、问题、答案（截断 tooltip）、状态（启用/隐藏 switch，faqUpdate）、操作（编辑/删除）
2. 新增/编辑弹窗：问题*、答案*（textarea）、排序值；faqCreate / faqUpdate
3. 删除二次确认 faqDelete；关键字搜索（问题/答案）

## 验收标准
- 修改客服电话保存后，curl http://localhost:8850/api/v1/app/settings 返回新值
- 二维码上传后回显且保存后刷新页面仍在
- FAQ 新增后端上 faqs 列表出现；隐藏后端上消失

## 自测步骤
改电话保存 → curl 验证 → 上传任意 png 作二维码 → 新增 FAQ「测试Q」→ 隐藏 → curl /api/v1/app/faqs 不再含它
