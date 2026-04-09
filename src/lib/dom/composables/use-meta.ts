import { toValue, type MaybeRefOrGetter } from "vue";
import type { HeadMetaDescriptor } from "../head.ts";
import { useHead } from "./use-head.ts";

export function useMeta(
  meta: MaybeRefOrGetter<readonly HeadMetaDescriptor[] | null | undefined>,
): void {
  useHead(() => ({
    meta: toValue(meta) ?? [],
  }));
}
