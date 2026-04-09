import { defineComponent, h } from "vue";

const viteImportMeta = import.meta as ImportMeta & {
  env?: {
    DEV?: boolean;
    PROD?: boolean;
  };
};

const isDevelopment =
  viteImportMeta.env?.PROD === true
    ? false
    : typeof process !== "undefined"
      ? process.env.NODE_ENV !== "production"
      : true;

const DevOnly = defineComponent({
  name: "VuePageletDevOnly",
  props: {
    fallback: {
      type: null,
      required: false,
      default: null,
    },
  },
  setup(props, { slots }) {
    return () => {
      if (isDevelopment) {
        return slots.default?.() ?? null;
      }

      if (slots.fallback) {
        return slots.fallback();
      }

      if (props.fallback) {
        return h(props.fallback as never);
      }

      return null;
    };
  },
});

export default DevOnly;
export { DevOnly };
