import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { createPageRouter } from "../../src/lib/router/router.ts";
import { RouterView } from "../../src/lib/dom/components/route-view.ts";
import { matchPageRoute } from "../../src/lib/router/matcher.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";
import { createPageRuntimeState } from "../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../src/lib/runtime/types.ts";
import { useAppData } from "../../src/lib/dom/composables/use-app-data.ts";
import { useSubmit } from "../../src/lib/dom/composables/use-submit.ts";

function createRoutes(): PageRouteRecord[] {
  const RootLayout = defineComponent({
    name: "RootLayout",
    setup() {
      return () => h(RouterView);
    },
  });
  const PostPage = defineComponent({
    name: "PostPage",
    setup() {
      const submit = useSubmit();

      return () =>
        h("div", [
          h("button", {
            "data-testid": "plain-action",
            onClick: () => submit({ mode: "plain" }, { action: "/posts/hello", method: "post" }),
          }),
          h("button", {
            "data-testid": "refresh-action",
            onClick: () =>
              submit({ mode: "refresh-app" }, { action: "/posts/hello", method: "post" }),
          }),
          h("div", { "data-testid": "post-page" }, "post page"),
        ]);
    },
  });

  return [
    {
      id: "root",
      path: "/",
      module: {
        component: RootLayout,
      },
      children: [
        {
          id: "posts",
          path: "posts/:slug",
          module: {
            component: PostPage,
            loader: async ({ params }) => ({ slug: params.slug }),
            action: async ({ formData, params }) => ({
              slug: params.slug,
              refreshApp: formData.get("mode") === "refresh-app",
            }),
          },
          children: [],
        },
      ],
    },
  ];
}

const AppShell = defineComponent({
  name: "AppShell",
  setup() {
    const appData = useAppData<{ loadedAt: string }>();

    return () =>
      h("section", [
        h("div", { "data-testid": "app-loaded-at" }, appData.value?.loadedAt ?? "missing"),
        h(RouterView),
      ]);
  },
});

async function mountAt(pathname: string) {
  const routes = createRoutes();
  window.history.replaceState({}, "", pathname);
  const match = matchPageRoute(window.location.href, routes);
  if (!match) {
    throw new Error(`route match not found for ${pathname}`);
  }

  const state = createPageRuntimeState(match, routes);
  state.appData = { loadedAt: "initial-app" };
  state.loaderData = {
    posts: {
      slug: match.params.slug ?? "hello",
    },
  };

  const app = createApp(
    defineComponent({
      name: "BrowserHarness",
      setup() {
        return () =>
          h(AppShell, null, {
            default: () => h(RouterView),
          });
      },
    }),
  );
  const router = createPageRouter({
    routes,
    state,
  });
  const container = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(container);

  app.use(router);
  app.provide(pageRuntimeStateKey, state);
  await router.push(pathname);
  await router.isReady();
  app.mount(container);

  return { app, router, state, container };
}

describe("app revalidation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("updates app data on navigation, keeps it stable on plain action, and refreshes it on opted-in action", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method =
        input instanceof Request
          ? input.method.toUpperCase()
          : (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && url.includes("/posts/world")) {
        return new Response(
          JSON.stringify({
            routeId: "posts",
            ok: true,
            status: 200,
            pathname: "/posts/world",
            appData: {
              loadedAt: "nav-app",
            },
            revalidatedRouteIds: ["posts"],
            loaderData: {
              posts: {
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
        );
      }

      if (method === "POST") {
        const request = input instanceof Request ? input : new Request(url, init);
        const formData = await request.formData();
        const mode = String(formData.get("mode") ?? "");

        return new Response(
          JSON.stringify({
            routeId: "posts",
            ok: true,
            status: 200,
            ...(mode === "refresh-app"
              ? {
                  appData: {
                    loadedAt: "action-app",
                  },
                }
              : {}),
            actionData: {
              refreshApp: mode === "refresh-app",
            },
            revalidatedRouteIds: [],
            loaderData: {},
            deferredData: {},
            routeErrors: {},
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { app, router, container } = await mountAt("/posts/hello");

    const appLoadedAt = () => container.querySelector('[data-testid="app-loaded-at"]')?.textContent;

    expect(appLoadedAt()).toBe("initial-app");

    await router.push("/posts/world");
    await vi.waitFor(() => {
      expect(appLoadedAt()).toBe("nav-app");
    });

    const plainActionButton = container.querySelector('[data-testid="plain-action"]');
    if (!(plainActionButton instanceof HTMLButtonElement)) {
      throw new Error("plain action button not found");
    }
    plainActionButton.click();
    await nextTick();
    await Promise.resolve();

    expect(appLoadedAt()).toBe("nav-app");

    const refreshActionButton = container.querySelector('[data-testid="refresh-action"]');
    if (!(refreshActionButton instanceof HTMLButtonElement)) {
      throw new Error("refresh action button not found");
    }
    refreshActionButton.click();
    await vi.waitFor(() => {
      expect(appLoadedAt()).toBe("action-app");
    });

    app.unmount();
  });
});
