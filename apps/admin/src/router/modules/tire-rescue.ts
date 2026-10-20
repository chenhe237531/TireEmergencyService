import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

/** 救援通知：司机点击「故障找救援」后到这里人工跟进 */
export default {
  path: "/tire/rescue",
  name: "TireRescue",
  component: Layout,
  meta: { icon: "tabler/sos", title: "救援通知", rank: 2 },
  children: [
    {
      path: "/tire/rescue",
      name: "TireRescueList",
      component: () => import("@/views/tire/rescue/index.vue"),
      meta: { title: "救援通知", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
