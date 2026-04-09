import { renderToString } from "@vue/server-renderer";
import { createSSRApp, defineComponent, h } from "vue";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createPageRouter } from "../../../../src/lib/router/router.ts";
import type { PageRouteRecord } from "../../../../src/lib/router/types.ts";
import { pageRuntimeStateKey } from "../../../../src/lib/runtime/types.ts";
import { createPageRuntimeState } from "../../../../src/lib/runtime/state.ts";
import { useFetcher } from "../../../../src/lib/dom/composables/use-fetcher.ts";
import { useSubmit } from "../../../../src/lib/dom/composables/use-submit.ts";

describe("useSubmit", () => {
  it("merges action revalidation payloads into runtime state and clears stale matched boundary errors", async () => {
    const component = defineComponent({
      name: "SubmitPage",
      setup() {
        return () => null;
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component,
        },
        children: [
          {
            id: "posts",
            path: "posts",
            module: {
              error: component,
            },
            children: [
              {
                id: "post-detail",
                path: ":slug",
                module: {
                  component,
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const match = {
      route: routes[0]!.children[0]!.children[0]!,
      matches: [routes[0]!, routes[0]!.children[0]!, routes[0]!.children[0]!.children[0]!],
      params: { slug: "hello" },
      pathname: "/posts/hello",
      query: {},
      hash: "",
    };
    const state = createPageRuntimeState(match, routes);
    state.loaderData = {
      posts: { title: "stale posts" },
      "post-detail": { slug: "hello", title: "old" },
    };
    state.deferredData = {
      "post-detail": {
        slowBlock: "stale deferred",
      },
    };
    state.pendingDeferredKeys = {
      posts: ["oldPending"],
      "post-detail": ["slowBlock"],
    };
    state.routeErrors = {
      posts: { message: "stale posts error" },
      unrelated: { message: "keep me" },
    };

    let submit: ReturnType<typeof useSubmit> | null = null;

    const app = createSSRApp(
      defineComponent({
        name: "SubmitHarness",
        setup() {
          submit = useSubmit();
          return () => h("div");
        },
      }),
    );
    const router = createPageRouter({
      routes,
      state,
      history: createMemoryHistory(),
    });

    await router.push("/posts/hello");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    await renderToString(app);

    expect(submit).not.toBeNull();

    const payload = {
      routeId: "post-detail",
      ok: true,
      status: 200,
      actionData: {
        saved: true,
      },
      revalidatedRouteIds: ["posts", "post-detail"],
      loaderData: {
        posts: { title: "fresh posts" },
        "post-detail": { slug: "hello", title: "fresh" },
      },
      deferredData: {
        "post-detail": {
          slowBlock: "fresh deferred",
        },
      },
      routeErrors: {},
    };

    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });

    const result = await submit!(
      {
        content: "hello",
      },
      {
        fetcher: async () => response,
      },
    );

    expect(result).toEqual(payload);
    expect(state.actionData).toEqual({
      "post-detail": {
        saved: true,
      },
    });
    expect(state.loaderData).toEqual({
      posts: { title: "fresh posts" },
      "post-detail": { slug: "hello", title: "fresh" },
    });
    expect(state.deferredData).toEqual({
      "post-detail": {
        slowBlock: "fresh deferred",
      },
    });
    expect(state.pendingDeferredKeys).toEqual({});
    expect(state.routeErrors).toEqual({
      unrelated: { message: "keep me" },
    });
  });

  it("updates fetcher state, method, action, and data when submitting", async () => {
    const component = defineComponent({
      name: "FetcherPage",
      setup() {
        return () => null;
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component,
        },
        children: [
          {
            id: "post-detail",
            path: "posts/:slug",
            module: {
              component,
            },
            children: [],
          },
        ],
      },
    ];
    const match = {
      route: routes[0]!.children[0]!,
      matches: [routes[0]!, routes[0]!.children[0]!],
      params: { slug: "hello" },
      pathname: "/posts/hello",
      query: {},
      hash: "",
    };
    const state = createPageRuntimeState(match, routes);

    let fetcher: ReturnType<typeof useFetcher<{ saved: boolean }>> | null = null;
    const app = createSSRApp(
      defineComponent({
        name: "FetcherHarness",
        setup() {
          fetcher = useFetcher<{ saved: boolean }>();
          return () => h("div");
        },
      }),
    );
    const router = createPageRouter({
      routes,
      state,
      history: createMemoryHistory(),
    });

    await router.push("/posts/hello");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    await renderToString(app);

    expect(fetcher).not.toBeNull();

    const onSuccess = vi.fn();
    const payload = {
      routeId: "post-detail",
      ok: true,
      status: 200,
      actionData: {
        saved: true,
      },
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {},
    };
    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });

    const result = await fetcher!.submit(
      {
        title: "hello",
      },
      {
        action: "/posts/world",
        method: "patch",
        fetcher: async () => response,
        onSuccess,
      },
    );

    expect(result).toEqual(payload);
    expect(fetcher!.state.value).toBe("idle");
    expect(fetcher!.data.value).toEqual({
      saved: true,
    });
    expect(fetcher!.formAction.value).toBe("/posts/world");
    expect(fetcher!.formMethod.value).toBe("PATCH");
    expect(onSuccess).toHaveBeenCalledWith(payload);
  });

  it("forwards AbortSignal through submit and fetcher requests", async () => {
    const component = defineComponent({
      name: "SignalPage",
      setup() {
        return () => null;
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component,
        },
        children: [
          {
            id: "post-detail",
            path: "posts/:slug",
            module: {
              component,
            },
            children: [],
          },
        ],
      },
    ];
    const match = {
      route: routes[0]!.children[0]!,
      matches: [routes[0]!, routes[0]!.children[0]!],
      params: { slug: "hello" },
      pathname: "/posts/hello",
      query: {},
      hash: "",
    };
    const state = createPageRuntimeState(match, routes);

    let submit: ReturnType<typeof useSubmit> | null = null;
    let fetcher: ReturnType<typeof useFetcher<{ saved: boolean }>> | null = null;

    const app = createSSRApp(
      defineComponent({
        name: "SignalHarness",
        setup() {
          submit = useSubmit();
          fetcher = useFetcher<{ saved: boolean }>();
          return () => h("div");
        },
      }),
    );
    const router = createPageRouter({
      routes,
      state,
      history: createMemoryHistory(),
    });

    await router.push("/posts/hello");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    await renderToString(app);

    const controller = new AbortController();
    const payload = {
      routeId: "post-detail",
      ok: true,
      status: 200,
      actionData: { saved: true },
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {},
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      expect(request.signal.aborted).toBe(false);
      expect(init?.signal).toBe(controller.signal);

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    await submit!(
      { content: "hello" },
      {
        signal: controller.signal,
        fetcher: fetchMock,
      },
    );

    await fetcher!.submit(
      { content: "hello" },
      {
        signal: controller.signal,
        fetcher: fetchMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
