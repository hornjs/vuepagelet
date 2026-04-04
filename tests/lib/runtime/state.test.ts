import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import {
  applyAppState,
  applyDeferredChunk,
  createPageRuntimeState,
} from "../../../src/lib/runtime/state.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";

function createComponent(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => null;
    },
  });
}

describe("runtime state boundaries", () => {
  it("keeps existing app state when payload omits app fields", () => {
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

    const state = createPageRuntimeState(
      {
        route: routes[0]!,
        matches: [routes[0]!],
        params: {},
        pathname: "/",
        query: {},
        hash: "",
      },
      routes,
    );

    state.appData = new Map([["theme", "dark"]]);
    state.appError = new Error("existing app error");

    applyAppState(state, {});

    expect(state.appData).toBeInstanceOf(Map);
    expect(state.appData).toEqual(new Map([["theme", "dark"]]));
    expect(state.appError).toBeInstanceOf(Error);
    expect((state.appError as Error).message).toBe("existing app error");
  });

  it("assigns deferred errors to the nearest route error boundary and clears pending keys", () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: createComponent("RootBoundary"),
        },
        children: [
          {
            id: "posts",
            path: "posts",
            module: {
              error: createComponent("PostsBoundary"),
            },
            children: [
              {
                id: "post-detail",
                path: ":slug",
                module: {
                  component: createComponent("PostPage"),
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const state = createPageRuntimeState(
      {
        route: routes[0]!.children[0]!.children[0]!,
        matches: [routes[0]!, routes[0]!.children[0]!, routes[0]!.children[0]!.children[0]!],
        params: { slug: "hello" },
        pathname: "/posts/hello",
        query: {},
        hash: "",
      },
      routes,
    );

    state.pendingDeferredKeys = {
      "post-detail": ["slowBlock"],
    };

    applyDeferredChunk(state, {
      routeId: "post-detail",
      key: "slowBlock",
      error: new Error("deferred failed"),
    });

    expect(state.pendingDeferredKeys).toEqual({});
    expect(state.deferredErrors).toEqual({
      "post-detail": {
        slowBlock: expect.any(Error),
      },
    });
    expect(state.routeErrors).toEqual({
      posts: expect.objectContaining({
        message: "deferred failed",
      }),
    });
  });
});
