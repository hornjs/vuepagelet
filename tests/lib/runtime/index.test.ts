import { describe, expect, it } from "vitest";
import { renderToString } from "@vue/server-renderer";
import { createSSRApp, defineComponent, h } from "vue";
import { createMemoryHistory } from "vue-router";
import { executeMatchedAction } from "../../../src/lib/runtime/action.ts";
import { defer, loadRouteData } from "../../../src/lib/runtime/deferred.ts";
import { collectRouteMiddleware } from "../../../src/lib/runtime/middleware.ts";
import { handlePageRequest } from "../../../src/lib/runtime/request.ts";
import { clearMatchedRouteErrors } from "../../../src/lib/runtime/route-errors.ts";
import {
  parseRuntimePayload,
  stringifyRuntimePayload,
} from "../../../src/lib/runtime/serialization.ts";
import { createPageRuntimeState } from "../../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../../src/lib/runtime/types.ts";
import { createRevalidationPlan } from "../../../src/lib/runtime/revalidation.ts";
import { matchPageRoute } from "../../../src/lib/router/matcher.ts";
import { createPageRouter } from "../../../src/lib/router/router.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";
import { RouterView } from "../../../src/lib/dom/components/route-view.ts";

function createRoutes(): PageRouteRecord[] {
  const component = defineComponent({
    name: "TestPage",
    setup() {
      return () => null;
    },
  });

  return [
    {
      id: "root",
      path: "/",
      module: {
        component,
        middleware: [async (_context, next) => next()],
      },
      children: [
        {
          id: "blog",
          path: "blog",
          module: {
            component,
            loader: async () =>
              defer(
                {
                  critical: true,
                },
                {
                  post: Promise.resolve("streamed"),
                },
              ),
          },
          children: [
            {
              id: "blog-slug",
              path: ":slug",
              module: {
                component,
                action: async ({ params }) => ({ slug: params.slug }),
                middleware: [async (_context, next) => next()],
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe("vuepagelet", () => {
  it("matches nested routes with vue-router matcher", () => {
    const match = matchPageRoute("http://local/blog/hello?draft=1", createRoutes());

    expect(match?.route.id).toBe("blog-slug");
    expect(match?.params).toEqual({ slug: "hello" });
    expect(match?.query).toEqual({ draft: "1" });
  });

  it("includes a pathless group route in matched records", () => {
    const component = defineComponent({
      name: "GroupedPage",
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
            id: "posts-group",
            module: {
              loader: async () => ({ section: "posts" }),
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
        ],
      },
    ];

    const match = matchPageRoute("http://local/posts/hello", routes);

    expect(match?.matches.map((entry) => entry.id)).toEqual(["root", "posts-group", "post-detail"]);
  });

  it("includes a pathful group route in matched records", () => {
    const component = defineComponent({
      name: "GroupedPage",
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
            id: "posts-group",
            path: "posts",
            module: {
              layout: component,
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

    const match = matchPageRoute("http://local/posts/world", routes);

    expect(match?.matches.map((entry) => entry.id)).toEqual(["root", "posts-group", "post-detail"]);
  });

  it("clears stale route errors for currently matched boundaries before merging new navigation data", () => {
    const component = defineComponent({
      name: "MatchedBoundaryPage",
      setup() {
        return () => null;
      },
    });
    const matches: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: component,
        },
        children: [],
      },
      {
        id: "posts",
        path: "posts",
        module: {
          error: component,
        },
        children: [],
      },
      {
        id: "post-detail",
        path: ":slug",
        module: {
          component,
        },
        children: [],
      },
    ];

    expect(
      clearMatchedRouteErrors(
        {
          root: { message: "old root error" },
          posts: { message: "old posts error" },
          unrelated: { message: "keep me" },
        },
        matches,
      ),
    ).toEqual({
      unrelated: { message: "keep me" },
    });
  });

  it("executes the nearest matched action", async () => {
    const request = new Request("http://local/blog/hello", {
      method: "POST",
      body: new URLSearchParams({
        title: "hello",
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });

    const result = await executeMatchedAction(request, createRoutes());

    expect(result?.route.id).toBe("blog-slug");
    expect(result?.data).toEqual({ slug: "hello" });
  });

  it("splits critical and deferred loader data", async () => {
    const routes = createRoutes();
    const match = matchPageRoute("http://local/blog/hello", routes);

    expect(match).not.toBeNull();

    const loaded = await loadRouteData(match!, new Request("http://local/blog/hello"));
    expect(loaded).not.toBeInstanceOf(Response);

    if (loaded instanceof Response) {
      return;
    }

    expect(loaded.loaderData.blog).toEqual({ critical: true });
    expect(collectRouteMiddleware(match!.matches)).toHaveLength(2);

    const firstDeferred = await loaded.pending[0]?.promise;
    expect(firstDeferred).toEqual({
      routeId: "blog",
      key: "post",
      data: "streamed",
    });
  });

  it("renders action data through the same document pipeline", async () => {
    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "POST",
        body: new URLSearchParams({
          title: "hello",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      {
        routes: createRoutes(),
      },
    );

    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("__VUEPAGELET__");
    expect(html).toContain('routeId:"blog-slug"');
    expect(html).toContain('slug:"hello"');
  });

  it("renders loading inside layout while deferred data is pending", async () => {
    const Loading = defineComponent({
      name: "LoadingState",
      setup() {
        return () => "loading state";
      },
    });
    const Page = defineComponent({
      name: "DeferredPage",
      setup() {
        return () => "page content";
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {},
        children: [
          {
            id: "deferred-page",
            path: "deferred",
            module: {
              component: Page,
              layout: defineComponent({
                name: "DeferredLayout",
                setup(_props, { slots }) {
                  return () => ["layout shell", slots.default ? slots.default() : null];
                },
              }),
              loading: Loading,
              loader: async () =>
                defer(
                  {
                    title: "critical",
                  },
                  {
                    details: Promise.resolve("later"),
                  },
                ),
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(new Request("http://local/deferred"), {
      routes,
    });
    const html = await response.text();

    expect(html).toContain("layout shell");
    expect(html).toContain("loading state");
    expect(html).not.toContain("page content");
  });

  it("renders route error inside layout", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {},
        children: [
          {
            id: "broken-page",
            path: "broken",
            module: {
              layout: defineComponent({
                name: "BrokenLayout",
                setup(_props, { slots }) {
                  return () => ["layout shell", slots.default ? slots.default() : null];
                },
              }),
              error: defineComponent({
                name: "BrokenError",
                props: {
                  error: {
                    type: null,
                    default: null,
                  },
                },
                setup(props) {
                  return () =>
                    `route error: ${
                      props.error instanceof Error ? props.error.message : String(props.error)
                    }`;
                },
              }),
            },
            children: [],
          },
        ],
      },
    ];

    const match = matchPageRoute("http://local/broken", routes);
    expect(match).not.toBeNull();

    const state = createPageRuntimeState(match!, routes);
    state.routeErrors = {
      "broken-page": new Error("component failed"),
    };

    const app = createSSRApp(
      defineComponent({
        name: "RouteErrorApp",
        setup() {
          return () => h(RouterView);
        },
      }),
    );
    const router = createPageRouter({
      routes,
      state,
      history: createMemoryHistory(),
    });
    await router.push(match!.pathname);
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    const html = await renderToString(app);

    expect(html).toContain("layout shell");
    expect(html).toContain("route error: component failed");
  });

  it("renders the route error boundary when the route component throws during SSR", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {},
        children: [
          {
            id: "broken-render",
            path: "broken-render",
            module: {
              component: defineComponent({
                name: "BrokenRenderPage",
                setup() {
                  return () => {
                    throw new Error("render failed");
                  };
                },
              }),
              layout: defineComponent({
                name: "BrokenRenderLayout",
                setup(_props, { slots }) {
                  return () => ["layout shell", slots.default ? slots.default() : null];
                },
              }),
              error: defineComponent({
                name: "BrokenRenderError",
                props: {
                  error: {
                    type: null,
                    default: null,
                  },
                },
                setup(props) {
                  return () =>
                    `route render error: ${
                      typeof props.error === "object" &&
                      props.error !== null &&
                      "message" in props.error
                        ? String((props.error as { message: string }).message)
                        : String(props.error)
                    }`;
                },
              }),
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(new Request("http://local/broken-render"), {
      routes,
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("layout shell");
    expect(html).toContain("route render error: render failed");
  });

  it("bubbles layout render errors to the parent route error boundary", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: defineComponent({
            name: "RootLayoutErrorBoundary",
            props: {
              error: {
                type: null,
                default: null,
              },
            },
            setup(props) {
              return () =>
                `parent layout error: ${
                  typeof props.error === "object" &&
                  props.error !== null &&
                  "message" in props.error
                    ? String((props.error as { message: string }).message)
                    : String(props.error)
                }`;
            },
          }),
        },
        children: [
          {
            id: "broken-layout",
            path: "broken-layout",
            module: {
              component: defineComponent({
                name: "BrokenLayoutPage",
                setup() {
                  return () => "page content";
                },
              }),
              layout: defineComponent({
                name: "ThrowingLayout",
                setup() {
                  return () => {
                    throw new Error("layout failed");
                  };
                },
              }),
              error: defineComponent({
                name: "ChildErrorBoundary",
                setup() {
                  return () => "child error boundary";
                },
              }),
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(new Request("http://local/broken-layout"), {
      routes,
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("parent layout error: layout failed");
    expect(html).not.toContain("child error boundary");
  });

  it("renders the nearest route error boundary when a loader throws", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: defineComponent({
            name: "RootErrorBoundary",
            props: {
              error: {
                type: null,
                default: null,
              },
            },
            setup(props) {
              return () =>
                `root loader error: ${
                  typeof props.error === "object" &&
                  props.error !== null &&
                  "message" in props.error
                    ? String((props.error as { message: string }).message)
                    : String(props.error)
                }`;
            },
          }),
        },
        children: [
          {
            id: "broken-loader",
            path: "broken-loader",
            module: {
              loader: async () => {
                throw new Error("loader failed");
              },
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(new Request("http://local/broken-loader"), {
      routes,
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("root loader error: loader failed");
  });

  it("returns json payload for intercepted action submissions", async () => {
    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "POST",
        body: new URLSearchParams({
          title: "hello",
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      {
        routes: createRoutes(),
      },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "blog-slug",
      ok: true,
      status: 200,
      actionData: {
        slug: "hello",
      },
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {},
    });
  });

  it("returns json payload for intercepted action submissions that revalidate deferred loaders", async () => {
    const component = defineComponent({
      name: "ActionDeferredPage",
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
              loader: async ({ params }) =>
                defer(
                  {
                    slug: params.slug,
                    critical: true,
                  },
                  {
                    slowBlock: Promise.resolve("streamed after action"),
                  },
                ),
              action: async ({ params }) => ({
                slug: params.slug,
                saved: true,
              }),
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/posts/hello", {
        method: "POST",
        body: new URLSearchParams({
          title: "hello",
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      {
        routes,
      },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "post-detail",
      ok: true,
      status: 200,
      actionData: {
        slug: "hello",
        saved: true,
      },
      revalidatedRouteIds: ["post-detail"],
      loaderData: {
        "post-detail": {
          slug: "hello",
          critical: true,
        },
      },
      deferredData: {
        "post-detail": {
          slowBlock: "streamed after action",
        },
      },
      routeErrors: {},
    });
  });

  it("does not throw when action request content-type is missing", async () => {
    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "POST",
        body: "title=hello",
        headers: {
          accept: "application/json",
        },
      }),
      {
        routes: createRoutes(),
      },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "blog-slug",
      ok: true,
      status: 200,
      actionData: {
        slug: "hello",
      },
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {},
    });
  });

  it("streams navigation payload and deferred chunks for intercepted client navigation", async () => {
    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      }),
      {
        routes: createRoutes(),
      },
    );

    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await response.text()).toBe(
      [
        stringifyRuntimePayload({
          type: "navigation",
          payload: {
            routeId: "blog-slug",
            ok: true,
            status: 200,
            pathname: "/blog/hello",
            revalidatedRouteIds: ["blog"],
            loaderData: {
              blog: {
                critical: true,
              },
            },
            deferredData: {},
            pendingDeferredKeys: {
              blog: ["post"],
            },
            routeErrors: {},
          },
        }),
        stringifyRuntimePayload({
          type: "deferred",
          chunk: {
            routeId: "blog",
            key: "post",
            data: "streamed",
          },
        }),
        "",
      ].join("\n"),
    );
  });

  it("returns route errors for intercepted navigation when a loader throws", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: defineComponent({
            name: "RootErrorBoundary",
            setup() {
              return () => null;
            },
          }),
        },
        children: [
          {
            id: "broken-loader",
            path: "broken-loader",
            module: {
              loader: async () => {
                throw new Error("loader failed");
              },
            },
            children: [],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/broken-loader", {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      }),
      {
        routes,
      },
    );

    expect(response.status).toBe(500);
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "broken-loader",
      ok: false,
      status: 500,
      pathname: "/broken-loader",
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {
        root: expect.objectContaining({
          message: "loader failed",
        }),
      },
    });
  });

  it("returns route errors for intercepted navigation when moving from another route into a broken loader", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: defineComponent({
            name: "RootErrorBoundary",
            setup() {
              return () => null;
            },
          }),
        },
        children: [
          {
            id: "posts",
            path: "posts",
            module: {
              error: defineComponent({
                name: "PostsErrorBoundary",
                setup() {
                  return () => null;
                },
              }),
            },
            children: [
              {
                id: "post-detail",
                path: ":slug",
                module: {
                  loader: async ({ params }) => {
                    if (params.slug === "loader-fail") {
                      throw new Error("post loader failed");
                    }

                    return { slug: params.slug };
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/posts/loader-fail", {
        method: "GET",
        headers: {
          accept: "application/json",
          referer: "http://local/posts/hello",
        },
      }),
      {
        routes,
      },
    );

    expect(response.status).toBe(500);
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "post-detail",
      ok: false,
      status: 500,
      pathname: "/posts/loader-fail",
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {
        posts: expect.objectContaining({
          message: "post loader failed",
        }),
      },
    });
  });

  it("defaults to only revalidating the leaf loader when route params change", () => {
    const calls = {
      root: 0,
      blog: 0,
      "blog-slug": 0,
    };
    const component = defineComponent({
      name: "RevalidationPage",
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
          loader: async () => {
            calls.root += 1;
            return { scope: "root" };
          },
        },
        children: [
          {
            id: "blog",
            path: "blog",
            module: {
              component,
              loader: async () => {
                calls.blog += 1;
                return { scope: "blog" };
              },
            },
            children: [
              {
                id: "blog-slug",
                path: ":slug",
                module: {
                  component,
                  loader: async () => {
                    calls["blog-slug"] += 1;
                    return { scope: "leaf" };
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const currentMatch = matchPageRoute("http://local/blog/hello", routes);
    const nextMatch = matchPageRoute("http://local/blog/world", routes);

    expect(currentMatch).not.toBeNull();
    expect(nextMatch).not.toBeNull();

    const plan = createRevalidationPlan({
      currentMatch: currentMatch!,
      nextMatch: nextMatch!,
      currentUrl: new URL("http://local/blog/hello"),
      nextUrl: new URL("http://local/blog/world"),
    });

    expect(plan.routeIds).toEqual(["blog-slug"]);
    expect(calls).toEqual({
      root: 0,
      blog: 0,
      "blog-slug": 0,
    });
  });

  it("allows routes to opt into revalidation with shouldRevalidate", async () => {
    const calls = {
      root: 0,
      "blog-slug": 0,
    };
    const component = defineComponent({
      name: "RevalidationPage",
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
          loader: async () => {
            calls.root += 1;
            return { theme: "light" };
          },
          shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
            defaultShouldRevalidate || currentUrl?.pathname !== nextUrl.pathname,
        },
        children: [
          {
            id: "blog",
            path: "blog",
            module: {
              component,
            },
            children: [
              {
                id: "blog-slug",
                path: ":slug",
                module: {
                  component,
                  loader: async ({ params }) => {
                    calls["blog-slug"] += 1;
                    return { slug: params.slug };
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/blog/world", {
        method: "GET",
        headers: {
          accept: "application/json",
          referer: "http://local/blog/hello",
        },
      }),
      {
        routes,
      },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "blog-slug",
      ok: true,
      status: 200,
      pathname: "/blog/world",
      revalidatedRouteIds: ["root", "blog-slug"],
      loaderData: {
        root: {
          theme: "light",
        },
        "blog-slug": {
          slug: "world",
        },
      },
      deferredData: {},
      pendingDeferredKeys: {},
      routeErrors: {},
    });
    expect(calls).toEqual({
      root: 1,
      "blog-slug": 1,
    });
  });

  it("allows action responses to trigger parent loader revalidation with shouldRevalidate", async () => {
    const calls = {
      root: 0,
      "blog-slug": 0,
    };
    let receivedActionStatus = 0;
    let receivedFormAction = "";
    const component = defineComponent({
      name: "ActionRevalidationPage",
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
          loader: async () => {
            calls.root += 1;
            return { theme: "dark" };
          },
          shouldRevalidate: (args) => {
            if (args.type === "action") {
              receivedActionStatus = args.actionStatus;
              receivedFormAction = args.formAction;
            }

            return (
              args.defaultShouldRevalidate ||
              (args.type === "action" &&
                Boolean(
                  args.actionResult &&
                  typeof args.actionResult === "object" &&
                  "refreshRoot" in args.actionResult &&
                  args.actionResult.refreshRoot === true,
                ))
            );
          },
        },
        children: [
          {
            id: "blog",
            path: "blog",
            module: {
              component,
            },
            children: [
              {
                id: "blog-slug",
                path: ":slug",
                module: {
                  component,
                  loader: async ({ params }) => {
                    calls["blog-slug"] += 1;
                    return { slug: params.slug };
                  },
                  action: async ({ params }) => ({
                    slug: params.slug,
                    refreshRoot: true,
                  }),
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "POST",
        body: new URLSearchParams({
          title: "hello",
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      {
        routes,
      },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "blog-slug",
      ok: true,
      status: 200,
      actionData: {
        slug: "hello",
        refreshRoot: true,
      },
      revalidatedRouteIds: ["root", "blog-slug"],
      loaderData: {
        root: {
          theme: "dark",
        },
        "blog-slug": {
          slug: "hello",
        },
      },
      deferredData: {},
      routeErrors: {},
    });
    expect(calls).toEqual({
      root: 1,
      "blog-slug": 1,
    });
    expect(receivedActionStatus).toBe(200);
    expect(receivedFormAction).toBe("/blog/hello");
  });

  it("returns route errors when action revalidation triggers a broken parent loader", async () => {
    const component = defineComponent({
      name: "BrokenParentRevalidationPage",
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
          error: defineComponent({
            name: "RootErrorBoundary",
            setup() {
              return () => null;
            },
          }),
          loader: async () => {
            throw new Error("root revalidation failed");
          },
          shouldRevalidate: (args) =>
            args.type === "action"
              ? Boolean(
                  args.actionResult &&
                  typeof args.actionResult === "object" &&
                  "refreshRoot" in args.actionResult &&
                  args.actionResult.refreshRoot === true,
                )
              : args.defaultShouldRevalidate,
        },
        children: [
          {
            id: "blog",
            path: "blog",
            module: {
              component,
            },
            children: [
              {
                id: "blog-slug",
                path: ":slug",
                module: {
                  component,
                  action: async ({ params }) => ({
                    slug: params.slug,
                    refreshRoot: true,
                  }),
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const response = await handlePageRequest(
      new Request("http://local/blog/hello", {
        method: "POST",
        body: new URLSearchParams({
          title: "hello",
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      {
        routes,
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "blog-slug",
      ok: false,
      status: 500,
      actionData: {
        slug: "hello",
        refreshRoot: true,
      },
      revalidatedRouteIds: [],
      loaderData: {},
      deferredData: {},
      routeErrors: {
        root: expect.objectContaining({
          message: "root revalidation failed",
        }),
      },
    });
  });
});
