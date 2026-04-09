import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";

export function useAppError<T = unknown>(): ComputedRef<T | null> {
  const state = usePageRuntimeState();

  return computed(() => (state.appError as T | null) ?? null);
}
