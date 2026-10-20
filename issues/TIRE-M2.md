# TIRE-M2 · 首页（小程序 tabbar 页）

目标：司机打开即见「附近门店」；信息模糊展示（无电话/地址/详情页）；一键呼救。

## 文件所有权
- apps/miniapp/src/pages/index/index.vue（tabbar 首页，桩已建）
- 可在本页目录新增子组件文件（pages/index/ 下）

## 功能需求
1. **顶部品牌栏**：小蚂蚁 logo 文字 + 平台客服电话条（GET /app/settings → servicePhone；点击 call(servicePhone)）
2. **定位**：uni.getLocation({type:'gcj02'}) 拿 lat/lng 存页面态；失败（拒绝授权）显示「手动输入位置」入口（弹窗输入描述文本 + 可选输入大致经纬度或直接用默认坐标 34.75,113.76 并 toast「未授权定位，展示默认城市门店」）
3. **金刚区 6 分类**（横向宫格，UnoCSS tabler 图标 + 名称）：全部/大车轮胎店/小车轮胎店/轮胎店(大小车)/大车修理厂/小车修理厂/救援拖车——含「全部」共 7 项，点击切换筛选刷新列表；分类 key 与后端一致（tire_big/tire_small/tire_both/repair_big/repair_small/towing）
4. **门店列表**（建议 z-paging，简单分页或一次全量均可——数据量小）：
   卡片：门店名 + 评分（星星+数字）+ 距离（distanceLabel，品牌橙加粗）+ 模糊区域 areaLabel + 主营项目标签（mainServices 按顿号拆 tag）
   列表按后端返回顺序（距离近→远）；顶部显示「已按距离由近到远排序」
5. **点击门店卡片**：toast「平台将为您对接服务，详情请致电平台客服」+ 同时 POST /app/view-log {storeId, action:'click'}（silent 容错，未登录静默跳过）
6. **悬浮「故障找救援」大按钮**（底部右下 .btn-rescue 圆形/胶囊 + i-tabler-sos 图标）：
   点击弹确认框（显示当前位置描述，可编辑补充如「高速上/桥下」）→ 确认 POST /app/rescue-alert {lat,lng,locationDesc}
   - 未登录：自动跳登录（request 层 40001 已处理）
   - 40011 需绑手机：弹窗输入手机号 → POST /app/auth/phone → 自动重试救援提交
   - 成功：成功弹窗「平台已收到您的求助，客服将尽快与您电话联系」
7. 页面下拉刷新（onPullDownRefresh 重新拉 stores）

## 验收标准
- H5 首页正常渲染门店（seed 10 家），授权定位后按距离排序、距离文案正确（如 850m/1.5km）
- 分类切换列表过滤正确；点卡片有 toast 且后台 view-logs 出现 click 记录（curl 验证）
- 救援按钮全流程：未登录→登录→绑手机→提交成功；后台 rescue-alerts 出现新待处理
- 无电话/地址/详情页泄漏

## 自测步骤
H5 打开首页 → 拒绝定位看降级 → 切分类 → 点门店 → curl 后台 view-logs → 点救援走全流程 → curl 后台 rescue-alerts
