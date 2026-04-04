import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { createRouteRuntimeIntegration } from "../../src/integration.ts";
import { defer } from "../../src/lib/runtime/deferred.ts";
import { renderPageResponse } from "../../src/lib/dom/ssr/renderer.ts";
import { handlePageRequest } from "../../src/lib/runtime/request.ts";
import {
  parseRuntimePayload,
  stringifyRuntimePayload,
} from "../../src/lib/runtime/serialization.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";

function createComponent(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => null;
    },
  });
}

describe("vuepagelet integration request flow", () => {
  it("keeps action responses on json even when revalidation includes deferred loaders", async () => {
    const component = createComponent("ActionDeferredPage");
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

    expect(response.status).toBe(200);
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

  it("streams navigation payload and deferred chunks for intercepted navigation", async () => {
    const component = createComponent("NavigationStreamPage");
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component,
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
        method: "GET",
        headers: {
          accept: "application/json",
        },
      }),
      {
        routes,
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

  it("returns nearest boundary route errors when navigating into a broken loader", async () => {
    const component = createComponent("BrokenLoaderPage");
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
              error: createComponent("PostsErrorBoundary"),
            },
            children: [
              {
                id: "post-detail",
                path: ":slug",
                module: {
                  component,
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

  it("renders a document response directly through the integration renderer", async () => {
    const component = createComponent("DocumentPage");
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component,
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component,
              loader: async () => ({
                title: "hello page",
              }),
            },
            children: [],
          },
        ],
      },
    ];

    const response = await renderPageResponse({
      request: new Request("http://local/hello"),
      routes,
      route: {
        route: routes[0]!.children[0]!,
        matches: [routes[0]!, routes[0]!.children[0]!],
        params: {},
        pathname: "/hello",
        query: {},
        hash: "",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("__VUEPAGELET__");
  });

  it("creates a stable high-level integration around app and routes", async () => {
    const component = createComponent("IntegrationFactoryPage");
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
            path: "posts/:slug",
            module: {
              component,
              loader: async ({ params }) => ({ slug: params.slug }),
            },
            children: [],
          },
        ],
      },
    ];

    const runtime = createRouteRuntimeIntegration({
      routes,
      app: {
        loader: async () => ({ theme: "document" }),
      },
      clientEntryPath: "/examples/basic/client.ts",
    });

    expect(runtime.match("http://local/posts/hello")?.route.id).toBe("posts");
    expect(runtime.resolveLocation("http://local/posts/hello")?.path).toBe("/posts/hello");

    const response = await runtime.handleRequest(
      new Request("http://local/posts/hello", {
        headers: {
          accept: "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "posts",
      ok: true,
      status: 200,
      pathname: "/posts/hello",
      appData: {
        theme: "document",
      },
      revalidatedRouteIds: ["posts"],
      loaderData: {
        posts: {
          slug: "hello",
        },
      },
      deferredData: {},
      pendingDeferredKeys: {},
      routeErrors: {},
    });
  });
});
