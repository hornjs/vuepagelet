import { toValue, type MaybeRefOrGetter } from "vue";
import type { HeadStyleDescriptor } from "../head.ts";
import { useHead } from "./use-head.ts";

export function useStyle(
  style: MaybeRefOrGetter<readonly HeadStyleDescriptor[] | null | undefined>,
): void {
  useHead(() => ({
    style: toValue(style) ?? [],
  }));
}
