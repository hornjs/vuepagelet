import { computed, type ComputedRef, type Ref } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";

export interface UseNavigationState {
  state: "idle" | "loading" | "submitting" | "navigating";
  location: string;
  previousLocation?: string;
  action: "push" | "replace" | "pop";
}

export function useNavigation(): {
  state: Ref<UseNavigationState["state"]>;
  location: Ref<UseNavigationState["location"]>;
  previousLocation: Ref<UseNavigationState["previousLocation"]>;
  action: Ref<UseNavigationState["action"]>;
  isLoading: ComputedRef<boolean>;
  isSubmitting: ComputedRef<boolean>;
  isNavigating: ComputedRef<boolean>;
} {
  const transitionState = usePageRuntimeState().transitionState;

  return {
    state: computed(() => transitionState.value.state) as Ref<UseNavigationState["state"]>,
    location: computed(() => transitionState.value.location) as Ref<UseNavigationState["location"]>,
    previousLocation: computed(() => transitionState.value.previousLocation) as Ref<
      UseNavigationState["previousLocation"]
    >,
    action: computed(() => transitionState.value.action) as Ref<UseNavigationState["action"]>,
    isLoading: computed(() => transitionState.value.state === "loading"),
    isSubmitting: computed(() => transitionState.value.state === "submitting"),
    isNavigating: computed(
      () =>
        transitionState.value.state === "navigating" || transitionState.value.state === "loading",
    ),
  };
}
