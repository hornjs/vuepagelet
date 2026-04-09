import { toValue, type MaybeRefOrGetter } from "vue";
import type { HeadScriptDescriptor } from "../head.ts";
import { useHead } from "./use-head.ts";

export function useScript(
  script: MaybeRefOrGetter<readonly HeadScriptDescriptor[] | null | undefined>,
): void {
  useHead(() => ({
    script: toValue(script) ?? [],
  }));
}
