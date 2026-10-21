import { R } from "../tireRoles";
const Layout = () => import("@/layout/index.vue");

/** 咨询工单：司机提交的服务咨询表单（车牌/车型/故障描述/图片） */
export default {
  path: "/tire-consult",
  redirect: "/tire/consult",
  name: "TireConsult",
  component: Layout,
  meta: { icon: "tabler/message-report", title: "咨询工单", rank: 3 },
  children: [
    {
      path: "/tire/consult",
      name: "TireConsultList",
      component: () => import("@/views/tire/consult/index.vue"),
      meta: { title: "咨询工单", roles: R.all, keepAlive: true }
    }
  ]
} satisfies RouteConfigsTable;
