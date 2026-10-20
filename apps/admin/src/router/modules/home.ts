import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

export default {
  path: "/",
  name: "Home",
  component: Layout,
  redirect: "/dashboard",
  meta: { icon: "tabler/layout-dashboard", title: "工作台", rank: 0 },
  children: [
    {
      path: "/dashboard",
      name: "TireDashboard",
      component: () => import("@/views/tire/dashboard/index.vue"),
      meta: { title: "工作台", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
