import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { createPageRouter } from "../../src/lib/router/router.ts";
import { RouterLink } from "../../src/lib/dom/components/route-link.ts";
import { RouterView } from "../../src/lib/dom/components/route-view.ts";
import { matchPageRoute } from "../../src/lib/router/matcher.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";
import { createPageRuntimeState } from "../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../src/lib/runtime/types.ts";

function createRoutes(): PageRouteRecord[] {
  const RootLayout = defineComponent({
    name: "RootLayout",
    setup() {
      return () =>
        h("div", [
          h("nav", [
            h(
              RouterLink,
              {
                to: "/posts/hello",
                activeClass: "is-active",
                exactActiveClass: "is-exact",
              },
              {
                default: () => "hello link",
              },
            ),
            h(
              RouterLink,
              {
                to: "/posts",
                activeClass: "parent-active",
                exactActiveClass: "parent-exact",
              },
              {
                default: () => "posts link",
              },
            ),
          ]),
          h(RouterView),
        ]);
    },
  });
  const HomePage = defineComponent({
    name: "HomePage",
    setup() {
      return () => h("div", "home page");
    },
  });
  const Leaf = defineComponent({
    name: "Leaf",
    setup() {
      return () => h("div", "post page");
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
          id: "home",
          path: "",
          module: {
            component: HomePage,
          },
          children: [],
        },
        {
          id: "posts",
          path: "posts",
          module: {
            component: defineComponent({
              name: "PostsLayout",
              setup() {
                return () => h(RouterView);
              },
            }),
          },
          children: [
            {
              id: "post-detail",
              path: ":slug",
              module: {
                component: Leaf,
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

async function mountAt(pathname: string) {
  const routes = createRoutes();
  window.history.replaceState({}, "", pathname);
  const match = matchPageRoute(window.location.href, routes);
  if (!match) {
    throw new Error(`route match not found for ${pathname}`);
  }

  const state = createPageRuntimeState(match, routes);
  const app = createApp(
    defineComponent({
      setup() {
        return () => h(RouterView);
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

  return { app, router, container };
}

describe("RouterLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("applies active and exact-active classes based on the current route", async () => {
    const { app, container } = await mountAt("/");

    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("/posts/hello");
    expect(links[0]?.className).toBe("");
    expect(links[1]?.className).toBe("");

    app.unmount();
  });

  it("updates classes after navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              routeId: "post-detail",
              ok: true,
              status: 200,
              pathname: "/posts/hello",
              revalidatedRouteIds: [],
              loaderData: {},
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
      ),
    );

    const { app, router, container } = await mountAt("/");

    await router.push("/posts/hello");
    await Promise.resolve();

    const links = [...container.querySelectorAll("a")];
    expect(links[0]?.className).toContain("is-active");
    expect(links[0]?.className).toContain("is-exact");
    expect(links[1]?.className).toContain("parent-active");
    expect(links[1]?.className).not.toContain("parent-exact");

    app.unmount();
  });
});
