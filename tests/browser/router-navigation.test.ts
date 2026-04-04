import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { createPageRouter } from "../../src/lib/router/router.ts";
import { matchPageRoute } from "../../src/lib/router/matcher.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";
import { createPageRuntimeState } from "../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../src/lib/runtime/types.ts";
import { RouterView } from "../../src/lib/dom/components/route-view.ts";
import { useLoaderData } from "../../src/lib/dom/composables/use-loader-data.ts";
import { useRoute } from "../../src/lib/dom/composables/use-route.ts";

function createRoutes(): PageRouteRecord[] {
  const RootShell = defineComponent({
    name: "RootShell",
    setup(_props, { slots }) {
      return () => h("main", slots.default ? slots.default() : []);
    },
  });
  const PostsError = defineComponent({
    name: "PostsError",
    props: {
      error: {
        type: null,
        default: null,
      },
    },
    setup(props) {
      return () =>
        h(
          "div",
          { "data-testid": "posts-error" },
          `posts error: ${
            typeof props.error === "object" && props.error !== null && "message" in props.error
              ? String((props.error as { message: string }).message)
              : String(props.error)
          }`,
        );
    },
  });
  const PostPage = defineComponent({
    name: "PostPage",
    setup() {
      const route = useRoute();
      const loaderData = useLoaderData<{ slug: string }>();

      return () => {
        if (route.value.params.slug === "render-fail") {
          throw new Error("render failed");
        }

        return h(
          "article",
          { "data-testid": "post-page" },
          `post: ${loaderData.value?.slug ?? "loading"}`,
        );
      };
    },
  });

  return [
    {
      id: "root",
      path: "/",
      module: {
        component: RootShell,
      },
      children: [
        {
          id: "posts",
          path: "posts",
          module: {
            error: PostsError,
          },
          children: [
            {
              id: "post-detail",
              path: ":slug",
              module: {
                component: PostPage,
                loader: async ({ params }) => ({
                  slug: params.slug,
                }),
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

async function mountAtPath(pathname: string, routes: PageRouteRecord[]) {
  window.history.replaceState({}, "", pathname);
  const match = matchPageRoute(window.location.href, routes);
  if (!match) {
    throw new Error(`route match not found for ${pathname}`);
  }

  const state = createPageRuntimeState(match, routes);
  state.loaderData = {
    "post-detail": {
      slug: match.params.slug ?? pathname.split("/").pop() ?? "",
    },
  };

  const container = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(container);

  const app = createApp(
    defineComponent({
      name: "BrowserHarness",
      setup() {
        return () => h(RouterView);
      },
    }),
  );
  const router = createPageRouter({
    routes,
    state,
  });

  app.use(router);
  app.provide(pageRuntimeStateKey, state);
  await router.push(pathname);
  await router.isReady();
  app.mount(container);

  return { app, router, state, container };
}

describe("browser router navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("clears captured route errors after navigating from an error page to a normal page", async () => {
    const routes = createRoutes();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

      expect(requestUrl).toContain("/posts/hello");
      expect(init?.referrer).toContain("/posts/render-fail");

      return new Response(
        JSON.stringify({
          routeId: "post-detail",
          ok: true,
          status: 200,
          pathname: "/posts/hello",
          revalidatedRouteIds: ["post-detail"],
          loaderData: {
            "post-detail": {
              slug: "hello",
            },
          },
          deferredData: {},
          pendingDeferredKeys: {},
          routeErrors: {},
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { app, router, container } = await mountAtPath("/posts/render-fail", routes);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("posts error: render failed");
    });

    await router.push("/posts/hello");

    await vi.waitFor(() => {
      expect(container.textContent).toContain("post: hello");
      expect(container.textContent).not.toContain("posts error: render failed");
    });

    app.unmount();
  });

  it("renders the nearest route error boundary when navigation loader data returns route errors", async () => {
    const routes = createRoutes();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.referrer).toContain("/posts/hello");

      return new Response(
        JSON.stringify({
          routeId: "post-detail",
          ok: false,
          status: 500,
          pathname: "/posts/loader-fail",
          revalidatedRouteIds: [],
          loaderData: {},
          deferredData: {},
          routeErrors: {
            posts: {
              message: "post loader failed",
            },
          },
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { app, router, container } = await mountAtPath("/posts/hello", routes);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("post: hello");
    });

    await router.push("/posts/loader-fail");

    await vi.waitFor(() => {
      expect(container.textContent).toContain("posts error: post loader failed");
    });

    app.unmount();
  });

  it("aborts stale navigation requests and ignores late responses from older streams", async () => {
    const routes = createRoutes();
    let firstRequestAborted = false;
    let resolveFirstResponse!: (response: Response) => void;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

      if (requestUrl.includes("/posts/world")) {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          firstRequestAborted = true;
        });

        return new Promise<Response>((resolve) => {
          resolveFirstResponse = resolve;
        });
      }

      if (requestUrl.includes("/posts/loader-fail")) {
        expect(init?.referrer).toContain("/posts/world");

        return Promise.resolve(
          new Response(
            JSON.stringify({
              routeId: "post-detail",
              ok: false,
              status: 500,
              pathname: "/posts/loader-fail",
              revalidatedRouteIds: [],
              loaderData: {},
              deferredData: {},
              routeErrors: {
                posts: {
                  message: "post loader failed",
                },
              },
            }),
            {
              status: 500,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        );
      }

      throw new Error(`unexpected request ${requestUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { app, router, container } = await mountAtPath("/posts/hello", routes);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("post: hello");
    });

    await router.push("/posts/world");
    await router.push("/posts/loader-fail");

    await vi.waitFor(() => {
      expect(firstRequestAborted).toBe(true);
      expect(container.textContent).toContain("posts error: post loader failed");
    });

    resolveFirstResponse(
      new Response(
        JSON.stringify({
          routeId: "post-detail",
          ok: true,
          status: 200,
          pathname: "/posts/world",
          revalidatedRouteIds: ["post-detail"],
          loaderData: {
            "post-detail": {
              slug: "world",
            },
          },
          deferredData: {},
          pendingDeferredKeys: {},
          routeErrors: {},
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toContain("posts error: post loader failed");
    expect(container.textContent).not.toContain("post: world");

    app.unmount();
  });

  it("clears revalidating loader data so the next route does not render stale content", async () => {
    const routes = createRoutes();
    let resolveResponse!: (response: Response) => void;

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.referrer).toContain("/posts/hello");

      return new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { app, router, container } = await mountAtPath("/posts/hello", routes);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("post: hello");
    });

    await router.push("/posts/world");

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("post: loading");
      expect(container.textContent).not.toContain("post: hello");
    });

    resolveResponse(
      new Response(
        JSON.stringify({
          routeId: "post-detail",
          ok: true,
          status: 200,
          pathname: "/posts/world",
          revalidatedRouteIds: ["post-detail"],
          loaderData: {
            "post-detail": {
              slug: "world",
            },
          },
          deferredData: {},
          pendingDeferredKeys: {},
          routeErrors: {},
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await vi.waitFor(() => {
      expect(container.textContent).toContain("post: world");
    });

    app.unmount();
  });
});
