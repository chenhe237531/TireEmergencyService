import { h, defineComponent } from "vue";
import type { Component, PropType } from "vue";
import { Icon as IconifyIcon, addIcon } from "@iconify/vue/dist/offline";
import type { IconifyIcon as IconifyIconData } from "@iconify/vue";

// Iconify Icon在Vue里本地使用（用于内网环境）
export default defineComponent({
  name: "IconifyIconOffline",
  components: { IconifyIcon },
  props: {
    icon: {
      type: [String, Object, Function] as PropType<
        string | IconifyIconData | Component
      >,
      default: null
    }
  },
  render() {
    // addIcon 的签名要求 name 为 string；离线图标对象由调用方保证结构，
    // 历史行为是把对象自身当 name 透传，这里保留该行为、只做单点收窄
    if (typeof this.icon === "object")
      addIcon(
        this.icon as unknown as string,
        this.icon as IconifyIconData
      );
    const attrs = this.$attrs;
    if (typeof this.icon === "string") {
      return h(
        IconifyIcon,
        {
          icon: this.icon,
          "aria-hidden": false,
          style: attrs?.style
            ? Object.assign(attrs.style, { outline: "none" })
            : { outline: "none" },
          ...attrs
        },
        {
          default: () => []
        }
      );
    } else {
      return h(
        this.icon,
        {
          "aria-hidden": false,
          style: attrs?.style
            ? Object.assign(attrs.style, { outline: "none" })
            : { outline: "none" },
          ...attrs
        },
        {
          default: () => []
        }
      );
    }
  }
});
