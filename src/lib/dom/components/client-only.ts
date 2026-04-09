import { defineComponent, h, onMounted, ref } from "vue";

const ClientOnly = defineComponent({
  name: "VuePageletClientOnly",
  props: {
    fallback: {
      type: null,
      required: false,
      default: null,
    },
  },
  setup(props, { slots }) {
    const isMounted = ref(false);

    onMounted(() => {
      isMounted.value = true;
    });

    return () => {
      if (isMounted.value) {
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

export default ClientOnly;
export { ClientOnly };
