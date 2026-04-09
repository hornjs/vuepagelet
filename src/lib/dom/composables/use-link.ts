import { toValue, type MaybeRefOrGetter } from "vue";
import type { HeadLinkDescriptor } from "../head.ts";
import { useHead } from "./use-head.ts";

export function useLink(
  link: MaybeRefOrGetter<readonly HeadLinkDescriptor[] | null | undefined>,
): void {
  useHead(() => ({
    link: toValue(link) ?? [],
  }));
}
