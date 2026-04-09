import { onUnmounted, toValue, watchEffect, type MaybeRefOrGetter } from "vue";
import { useHeadManager, type HeadInput } from "../head.ts";

export function useHead(input: MaybeRefOrGetter<HeadInput | null | undefined>): void {
  const manager = useHeadManager();
  const key = Symbol("vuepagelet-head-entry");

  watchEffect(
    () => {
      const value = toValue(input);
      manager.setEntry(key, value ?? {});
    },
    {
      flush: "sync",
    },
  );

  onUnmounted(() => {
    manager.deleteEntry(key);
  });
}
