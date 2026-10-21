import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

/** 门店管理：门店信息由后台录入，真实地址/电话仅后台可见 */
export default {
  path: "/tire-store",
  redirect: "/tire/store",
  name: "TireStore",
  component: Layout,
  meta: { icon: "tabler/building-store", title: "门店管理", rank: 1 },
  children: [
    {
      path: "/tire/store",
      name: "TireStoreList",
      component: () => import("@/views/tire/store/index.vue"),
      meta: { title: "门店管理", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
