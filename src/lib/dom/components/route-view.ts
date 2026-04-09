import { defineComponent, h, type VNode } from "vue";
import { RouterView as VueRouterView } from "vue-router";
import type { PageRouteRecord } from "../../router/types.ts";

export const RouterView = defineComponent({
  name: "PageRendererRouterView",
  inheritAttrs: false,
  setup() {
    return () => h(VueRouterView);
  },
});

export function renderRouteTree(matches: PageRouteRecord[]): VNode | null {
  return matches.length > 0 ? h(RouterView) : null;
}
