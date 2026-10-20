import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

/** 平台设置：客服电话/二维码、协议、常见问题 */
export default {
  path: "/tire/setting",
  name: "TirePlatform",
  component: Layout,
  redirect: "/tire/setting",
  meta: { icon: "tabler/settings", title: "平台设置", rank: 5 },
  children: [
    {
      path: "/tire/setting",
      name: "TireSetting",
      component: () => import("@/views/tire/setting/index.vue"),
      meta: { title: "平台设置", roles: R.all, keepAlive: true }
    },
    {
      path: "/tire/faq",
      name: "TireFaq",
      component: () => import("@/views/tire/faq/index.vue"),
      meta: { title: "常见问题", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
