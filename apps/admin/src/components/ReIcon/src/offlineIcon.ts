// 这里存放本地图标，在 src/layout/index.vue 文件中加载，避免在首启动加载
import { getSvgInfo } from "@pureadmin/utils";
import { addIcon } from "@iconify/vue/dist/offline";

// https://icon-sets.iconify.design/ep/?keyword=ep
import EpHomeFilled from "~icons/ep/home-filled?raw";

// https://icon-sets.iconify.design/ri/?keyword=ri
import RiSearchLine from "~icons/ri/search-line?raw";
import RiInformationLine from "~icons/ri/information-line?raw";

// Tabler Icons（与小程序端统一）
import Tb0 from "~icons/tabler/layout-dashboard?raw";
import Tb1 from "~icons/tabler/users?raw";
import Tb2 from "~icons/tabler/heart-rate-monitor?raw";
import Tb3 from "~icons/tabler/adjustments?raw";
import Tb4 from "~icons/tabler/speakerphone?raw";
import Tb5 from "~icons/tabler/building-hospital?raw";
import Tb6 from "~icons/tabler/sparkles?raw";
import Tb7 from "~icons/tabler/chart-bar?raw";
import Tb8 from "~icons/tabler/settings?raw";
import Tb9 from "~icons/tabler/device-mobile?raw";
import Tb10 from "~icons/tabler/clipboard-list?raw";
import Tb11 from "~icons/tabler/calendar?raw";
import Tb12 from "~icons/tabler/receipt?raw";
import Tb13 from "~icons/tabler/user-cog?raw";
import Tb14 from "~icons/tabler/stethoscope?raw";
import Tb15 from "~icons/tabler/home?raw";

const icons = [
  ["tabler/layout-dashboard", Tb0],
  ["tabler/users", Tb1],
  ["tabler/heart-rate-monitor", Tb2],
  ["tabler/adjustments", Tb3],
  ["tabler/speakerphone", Tb4],
  ["tabler/building-hospital", Tb5],
  ["tabler/sparkles", Tb6],
  ["tabler/chart-bar", Tb7],
  ["tabler/settings", Tb8],
  ["tabler/device-mobile", Tb9],
  ["tabler/clipboard-list", Tb10],
  ["tabler/calendar", Tb11],
  ["tabler/receipt", Tb12],
  ["tabler/user-cog", Tb13],
  ["tabler/stethoscope", Tb14],
  ["tabler/home", Tb15],
  // Element Plus Icon: https://github.com/element-plus/element-plus-icons
  ["ep/home-filled", EpHomeFilled],
  // Remix Icon: https://github.com/Remix-Design/RemixIcon
  ["ri/search-line", RiSearchLine],
  ["ri/information-line", RiInformationLine]
];

// 本地菜单图标，后端在路由的 icon 中返回对应的图标字符串并且前端在此处使用 addIcon 添加即可渲染菜单图标
icons.forEach(([name, icon]) => {
  addIcon(name as string, getSvgInfo(icon as string));
});
