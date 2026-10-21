import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

/** 司机与痕迹：司机列表 + 门店浏览/点击痕迹（辅助主动线下对接） */
export default {
  path: "/tire-driver",
  name: "TireDriver",
  component: Layout,
  redirect: "/tire/driver",
  meta: { icon: "tabler/users", title: "司机管理", rank: 4 },
  children: [
    {
      path: "/tire/driver",
      name: "TireDriverList",
      component: () => import("@/views/tire/driver/index.vue"),
      meta: { title: "司机管理", roles: R.all, keepAlive: true }
    },
    {
      path: "/tire/viewlog",
      name: "TireViewLog",
      component: () => import("@/views/tire/viewlog/index.vue"),
      meta: { title: "浏览痕迹", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
