import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import {
  createTransitionState,
  finishLoading,
  finishNavigation,
  finishSubmitting,
  initializeTransition,
  startLoading,
  startNavigation,
  startSubmitting,
  useTransitionManager,
} from "../../../src/lib/runtime/transition-manager.ts";
import { createPageRuntimeState } from "../../../src/lib/runtime/state.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";

function createComponent(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => null;
    },
  });
}

function createRuntimeState(pathname: string) {
  const routes: PageRouteRecord[] = [
    {
      id: "root",
      path: "/",
      module: {
        component: createComponent("RootPage"),
      },
      children: [],
    },
  ];

  return createPageRuntimeState(
    {
      route: routes[0]!,
      matches: [routes[0]!],
      params: {},
      pathname,
      query: {},
      hash: "",
    },
    routes,
  );
}

describe("transition manager", () => {
  it("tracks navigation, loading, and submitting states", () => {
    initializeTransition("/initial");
    expect(useTransitionManager().state.value).toMatchObject({
      state: "idle",
      location: "/initial",
      action: "push",
      isReady: true,
    });

    startNavigation("/posts/hello", "replace");
    expect(useTransitionManager().state.value).toMatchObject({
      state: "navigating",
      location: "/posts/hello",
      previousLocation: "/initial",
      action: "replace",
      isReady: false,
    });

    finishNavigation();
    expect(useTransitionManager().state.value).toMatchObject({
      state: "idle",
      location: "/posts/hello",
      previousLocation: "/initial",
      isReady: true,
    });

    startLoading();
    expect(useTransitionManager().state.value).toMatchObject({
      state: "loading",
      location: "/posts/hello",
      isReady: false,
    });

    finishLoading();
    expect(useTransitionManager().state.value).toMatchObject({
      state: "idle",
      location: "/posts/hello",
      isReady: true,
    });

    startSubmitting("/posts/world");
    expect(useTransitionManager().state.value).toMatchObject({
      state: "submitting",
      location: "/posts/world",
      isReady: false,
    });

    finishSubmitting();
    expect(useTransitionManager().state.value).toMatchObject({
      state: "idle",
      location: "/posts/world",
      isReady: true,
    });
  });

  it("keeps runtime-scoped transition state isolated from the global singleton", () => {
    initializeTransition("/global");
    const stateA = createRuntimeState("/alpha");
    const stateB = createRuntimeState("/beta");

    startNavigation(stateA, "/alpha/next", "replace");
    startLoading(stateB, "/beta/loading");
    startSubmitting(stateA, "/alpha/form");

    expect(stateA.transitionState.value).toMatchObject({
      state: "submitting",
      location: "/alpha/form",
      previousLocation: "/alpha",
      action: "replace",
      isReady: false,
    });
    expect(stateB.transitionState.value).toMatchObject({
      state: "loading",
      location: "/beta/loading",
      isReady: false,
    });
    expect(useTransitionManager().state.value).toMatchObject({
      state: "idle",
      location: "/global",
      action: "push",
      isReady: true,
    });

    finishSubmitting(stateA);
    finishLoading(stateB);
    finishNavigation(stateA);

    expect(stateA.transitionState.value).toMatchObject({
      state: "idle",
      location: "/alpha/form",
      isReady: true,
    });
    expect(stateB.transitionState.value).toMatchObject({
      state: "idle",
      location: "/beta/loading",
      isReady: true,
    });
  });

  it("creates independent transition refs per runtime state", () => {
    const first = createTransitionState("/one");
    const second = createTransitionState("/two");

    first.value.location = "/updated";

    expect(second.value.location).toBe("/two");
  });

  it("prefers an explicit runtime state over the global compatibility state", () => {
    initializeTransition("/global");
    const state = createRuntimeState("/scoped");

    startNavigation("/global/next", "replace");

    expect(useTransitionManager(state).state.value).toMatchObject({
      state: "idle",
      location: "/scoped",
      action: "push",
    });
    expect(useTransitionManager().state.value).toMatchObject({
      state: "navigating",
      location: "/global/next",
      action: "replace",
    });
  });
});
