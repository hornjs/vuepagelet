import { hasInjectionContext, inject, shallowRef, type ShallowRef } from "vue";
import { pageRuntimeStateKey, type PageRuntimeState, type TransitionSnapshot } from "./types.ts";

const compatTransitionState = shallowRef<TransitionSnapshot>({
  state: "idle",
  location: "/",
  action: "push",
  startTime: Date.now(),
  isReady: true,
});

export function createTransitionState(
  location: string,
  action: TransitionSnapshot["action"] = "push",
) {
  return shallowRef(createTransitionSnapshot(location, action));
}

export function initializeTransition(
  locationOrState: string | PageRuntimeState,
  nextLocation?: string | TransitionSnapshot["action"],
  action: TransitionSnapshot["action"] = "push",
): void {
  const target = resolveWritableTransitionState(locationOrState);
  target.value = createTransitionSnapshot(
    typeof locationOrState === "string"
      ? locationOrState
      : typeof nextLocation === "string"
        ? nextLocation
        : target.value.location,
    typeof locationOrState === "string" ? normalizeAction(nextLocation, action) : action,
  );
}

export function startNavigation(
  toOrState: string | PageRuntimeState,
  maybeTo?: string | TransitionSnapshot["action"],
  action: TransitionSnapshot["action"] = "push",
): void {
  const target = resolveWritableTransitionState(toOrState);
  const current = target.value;
  target.value = {
    state: "navigating",
    location:
      typeof toOrState === "string"
        ? toOrState
        : typeof maybeTo === "string"
          ? maybeTo
          : current.location,
    previousLocation: current.location,
    action: typeof toOrState === "string" ? normalizeAction(maybeTo, action) : action,
    startTime: Date.now(),
    isReady: false,
  };
}

export function finishNavigation(state?: PageRuntimeState): void {
  finishTransition(state);
}

export function startLoading(
  locationOrState: string | PageRuntimeState = compatTransitionState.value.location,
  location?: string,
): void {
  setBusyTransition(
    resolveWritableTransitionState(locationOrState),
    "loading",
    typeof locationOrState === "string"
      ? locationOrState
      : (location ?? locationOrState.transitionState.value.location),
  );
}

export function finishLoading(state?: PageRuntimeState): void {
  finishTransition(state);
}

export function startSubmitting(
  locationOrState: string | PageRuntimeState = compatTransitionState.value.location,
  location?: string,
): void {
  setBusyTransition(
    resolveWritableTransitionState(locationOrState),
    "submitting",
    typeof locationOrState === "string"
      ? locationOrState
      : (location ?? locationOrState.transitionState.value.location),
  );
}

export function finishSubmitting(state?: PageRuntimeState): void {
  finishTransition(state);
}

export function useTransitionManager(state?: PageRuntimeState) {
  return {
    state: resolveTransitionState(state),
  };
}

function createTransitionSnapshot(
  location: string,
  action: TransitionSnapshot["action"] = "push",
): TransitionSnapshot {
  return {
    state: "idle",
    location,
    previousLocation: undefined,
    action,
    startTime: Date.now(),
    isReady: true,
  };
}

function finishTransition(state?: PageRuntimeState): void {
  const target = resolveTransitionState(state);
  target.value = {
    ...target.value,
    state: "idle",
    isReady: true,
    startTime: Date.now(),
  };
}

function resolveTransitionState(state?: PageRuntimeState) {
  if (state) {
    return state.transitionState;
  }

  const injectedState = hasInjectionContext() ? inject(pageRuntimeStateKey, null) : null;
  return injectedState?.transitionState ?? compatTransitionState;
}

function resolveWritableTransitionState(
  state: string | PageRuntimeState,
): ShallowRef<TransitionSnapshot> {
  return typeof state === "string" ? compatTransitionState : state.transitionState;
}

function normalizeAction(
  candidate: string | TransitionSnapshot["action"] | undefined,
  fallback: TransitionSnapshot["action"] = "push",
): TransitionSnapshot["action"] {
  return candidate === "push" || candidate === "replace" || candidate === "pop"
    ? candidate
    : fallback;
}

function setBusyTransition(
  target: ShallowRef<TransitionSnapshot>,
  state: TransitionSnapshot["state"],
  location: string,
): void {
  target.value = {
    ...target.value,
    state,
    location,
    isReady: false,
    startTime: Date.now(),
  };
}
