## 小程序任务通用约定（M1-M5 共用，先读 issues/README.md）
- 技术栈：uni-app + Vue3 + TS + UnoCSS 原子类 + Pinia + z-paging（分页列表）；图标用 UnoCSS 的 i-tabler-* 类名（已装 tabler 图标集）
- 基础层只 import 不修改：src/tire/request.ts（http.get/post/patch、uploadImage(filePath)）、src/tire/store.ts（useTire：token/me/loggedIn/roleEmpty/loadMe/logout/setToken；DRIVER_ROLE_NAMES）、src/tire/utils.ts（go/back/toast/confirm/call/absUrl/deviceId）
- 设计令牌：src/style/index.scss（--brand 橙#E8721C、--alert 红、--ink 墨、--bg、.card、.btn-primary、.btn-rescue）；UI 优先 UnoCSS 原子类（p-4 mt-2 rounded-2xl text-sm 等），变量仅少量自定义样式用
- 平台差异必须条件编译：// #ifdef H5 与 // #ifdef MP-WEIXIN；H5 环境（localhost:9100）不得白屏/报错
- pages.json / manifest.json 是生成物不要手改；页面路由已全部注册好
- 代码风格：无分号+单引号、中文注释、script setup lang="ts"
- 后端约定：统一 {code,message,data}；40001=未登录（request 层自动跳 /pkg-auth/login）；40011=需绑手机号；40020=参数错误（request 层已 toast）
- 图片地址一律 absUrl('/uploads/xx') 转完整 URL
- 验证：浏览器 http://localhost:9100（H5 热更新即时生效）；微信专属能力写好条件编译即可，不必真机验证，但 H5 必须无错

## 端上接口速查（前缀 /api/v1，request 层已带）
- POST /app/auth/login {code} → {accessToken, user{roleEmpty}}
- POST /app/auth/phone {phone}；GET/PATCH /app/profile {nickname?,avatarUrl?,role?}
- GET /app/stores?category=&lat=&lng= → [{id,name,category,categoryName,mainServices,score,areaLabel,distanceKm,distanceLabel}]（无地址电话）
- POST /app/view-log {storeId,action}；POST /app/rescue-alert {lat,lng,locationDesc}
- POST /app/consult {plateNo,carModel,lat,lng,locationDesc,description,images[],contactName,contactPhone}
- GET /app/settings → {servicePhone,wechatQr,about,userAgreement,privacyPolicy,shareTitle}
- GET /app/faqs → [{id,question,answer}]
- POST /app/upload（multipart 字段 file）→ {url:'/uploads/xx'} —— 用 uploadImage(filePath)
