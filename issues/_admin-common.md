## 后台任务通用约定（A1-A5 共用，先读 issues/README.md）
- 技术栈：Vue 3.5 + TS + Element Plus 2.11 + TailwindCSS4 原子类；表格可配 @pureadmin/table（参考 src/components/RePureTableBar/src/bar.tsx 用法）；图表用已装 ECharts（参考 src/components/XChart/index.vue 封装，可直接用）
- 接口一律 import 自 '@/api/tire'（全部接口函数/TS 类型/业务字典已备好：STORE_CATEGORIES、ORDER_STATUS、statusTag、statusFlow、DRIVER_ROLES、fileUrl、uploadImage）——该文件只读
- 页面都在 src/views/tire/**（桩文件与路由已注册，直接访问对应路径）；组件 defineOptions name 必须与路由 meta 保持一致（keepAlive 需要）
- 代码风格：分号+双引号、中文注释、script setup lang="ts"
- 时间显示可用 dayjs（已装）；金额/距离等格式化自己写小函数
- 验证：浏览器 http://localhost:8850（admin/admin123），或 curl http://localhost:8850/api/v1/...
