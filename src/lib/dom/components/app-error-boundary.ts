import { defineComponent, h, onErrorCaptured, ref, watch } from "vue";

export const AppErrorBoundary = defineComponent({
  name: "AppErrorBoundary",
  props: {
    errorComponent: {
      type: [Object, Function],
      default: null,
    },
    externalError: {
      type: null,
      default: null,
    },
    boundaryKey: {
      type: String,
      required: true,
    },
    onCaptureError: {
      type: Function,
      default: null,
    },
  },
  setup(props, { slots }) {
    const capturedError = ref<unknown>(null);

    watch(
      () => props.boundaryKey,
      () => {
        capturedError.value = null;
      },
    );

    onErrorCaptured((errorValue) => {
      capturedError.value = errorValue;
      props.onCaptureError?.(errorValue);
      return false;
    });

    return () => {
      const activeError = props.externalError ?? capturedError.value;
      if (activeError && props.errorComponent) {
        return h(props.errorComponent as never, {
          error: activeError,
        });
      }

      return normalizeSlotContent(slots.default?.() ?? null);
    };
  },
});

function normalizeSlotContent(value: unknown) {
  if (Array.isArray(value)) {
    return value.length <= 1 ? (value[0] ?? null) : value;
  }

  return value;
}
