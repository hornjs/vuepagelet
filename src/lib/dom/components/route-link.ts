import { computed, defineComponent, h, type PropType } from "vue";
import { RouterLink as VueRouterLink } from "vue-router";
import type { PageRouteTo } from "../../router/types.ts";

const RouterLink = defineComponent({
  name: "PageRendererRouterLink",
  props: {
    to: {
      type: [String, Object] as PropType<PageRouteTo>,
      required: true,
    },
    replace: {
      type: Boolean,
      required: false,
    },
    activeClass: {
      type: String,
      required: false,
    },
    exactActiveClass: {
      type: String,
      required: false,
    },
  },
  setup(props, { slots }) {
    const resolvedTo = computed(() => props.to);

    return () =>
      h(
        VueRouterLink as never,
        {
          to: resolvedTo.value,
          replace: props.replace,
          activeClass: props.activeClass,
          exactActiveClass: props.exactActiveClass,
          custom: true,
        } as never,
        (linkProps: {
          href: string;
          navigate: (e?: MouseEvent) => void;
          isActive: boolean;
          isExactActive: boolean;
        }) =>
          h(
            "a",
            {
              href: linkProps.href,
              onClick: linkProps.navigate,
              class:
                [
                  props.activeClass && linkProps.isActive ? props.activeClass : "",
                  props.exactActiveClass && linkProps.isExactActive ? props.exactActiveClass : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
              "data-allow-mismatch": "class",
            },
            slots.default?.(),
          ),
      );
  },
});

export default RouterLink;
export { RouterLink };
