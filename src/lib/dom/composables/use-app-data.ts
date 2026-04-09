import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";

export function useAppData<T = unknown>(): ComputedRef<T | null> {
  const state = usePageRuntimeState();

  return computed(() => (state.appData as T | null) ?? null);
}
