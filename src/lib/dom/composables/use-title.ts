import { toValue, type MaybeRefOrGetter } from "vue";
import { useHead } from "./use-head.ts";

export function useTitle(title: MaybeRefOrGetter<string | null | undefined>): void {
  useHead(() => ({
    title: toValue(title),
  }));
}
