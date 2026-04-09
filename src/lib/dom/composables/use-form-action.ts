import { computed, type ComputedRef } from "vue";
import { useRoute } from "./use-route.ts";

export function useFormAction(action?: string): ComputedRef<string> {
  const route = useRoute();

  return computed(() => action ?? route.value.path);
}
