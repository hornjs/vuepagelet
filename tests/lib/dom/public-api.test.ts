import { renderToString } from "@vue/server-renderer";
import { createSSRApp, defineComponent, h } from "vue";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import { RouterLink } from "../../../src/lib/dom/components/route-link.ts";
import { RouterView, renderRouteTree } from "../../../src/lib/dom/components/route-view.ts";
import { useActionData } from "../../../src/lib/dom/composables/use-action-data.ts";
import { useNavigation } from "../../../src/lib/dom/composables/use-navigation.ts";
import {
  useCurrentPageRoute,
  usePageRoute,
  useRoute,
  useRouter,
} from "../../../src/lib/dom/composables/use-route.ts";
import { createPageRouter } from "../../../src/lib/router/router.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";
import { createPageRuntimeState } from "../../../src/lib/runtime/state.ts";
import { initializeTransition, startLoading } from "../../../src/lib/runtime/transition-manager.ts";
import { pageRuntimeStateKey } from "../../../src/lib/runtime/types.ts";

describe("dom public api", () => {
  it("renders router link href and renderRouteTree follows match presence", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootPage",
            setup() {
              return () =>
                h("div", [
                  h(
                    RouterLink,
                    {
                      to: "/posts/hello",
                    },
                    {
                      default: () => "go to post",
                    },
                  ),
                ]);
            },
          }),
        },
        children: [],
      },
    ];
    const match = {
      route: routes[0]!,
      matches: [routes[0]!],
      params: {},
      pathname: "/",
      query: {},
      hash: "",
    };
    const state = createPageRuntimeState(match, routes);
    const app = createSSRApp(
      defineComponent({
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

    await router.push("/");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);

    const html = await renderToString(app);

    expect(html).toContain('href="/posts/hello"');
    expect(html).toContain("go to post");
    expect(renderRouteTree([])).toBeNull();
    expect(renderRouteTree(routes)).not.toBeNull();
  });

  it("exposes route, page route, router, navigation, and action data composables", async () => {
    initializeTransition("/posts/hello");
    startLoading("/posts/hello");

    const Probe = defineComponent({
      name: "ComposableProbe",
      setup() {
        const route = useRoute();
        const currentPageRoute = useCurrentPageRoute();
        const pageRoute = usePageRoute();
        const router = useRouter();
        const actionData = useActionData<{ saved: boolean }>();
        const navigation = useNavigation();

        return () =>
          h(
            "pre",
            JSON.stringify({
              path: route.value.path,
              fullPath: route.value.fullPath,
              matched: route.value.matched.map((entry) => entry.id),
              currentPageRoute: currentPageRoute?.id ?? null,
              pageRoute: pageRoute.value?.id ?? null,
              resolvedHref: router.resolve("/posts/world").href,
              actionData: actionData.value,
              navigation: {
                state: navigation.state.value,
                location: navigation.location.value,
                isLoading: navigation.isLoading.value,
                isSubmitting: navigation.isSubmitting.value,
                isNavigating: navigation.isNavigating.value,
              },
            }),
          );
      },
    });

    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup() {
              return () => h(RouterView);
            },
          }),
        },
        children: [
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
                  component: Probe,
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
      query: { draft: "1" },
      hash: "#intro",
    };
    const state = createPageRuntimeState(match, routes);
    state.actionData = {
      "post-detail": {
        saved: true,
      },
    };

    const app = createSSRApp(
      defineComponent({
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

    await router.push("/posts/hello?draft=1#intro");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);

    const html = await renderToString(app);

    expect(html).toContain("&quot;path&quot;:&quot;/posts/hello&quot;");
    expect(html).toContain("&quot;fullPath&quot;:&quot;/posts/hello?draft=1#intro&quot;");
    expect(html).toContain(
      "&quot;matched&quot;:[&quot;root&quot;,&quot;posts&quot;,&quot;post-detail&quot;]",
    );
    expect(html).toContain("&quot;currentPageRoute&quot;:&quot;post-detail&quot;");
    expect(html).toContain("&quot;pageRoute&quot;:&quot;post-detail&quot;");
    expect(html).toContain("&quot;resolvedHref&quot;:&quot;/posts/world&quot;");
    expect(html).toContain("&quot;saved&quot;:true");
    expect(html).toContain("&quot;state&quot;:&quot;idle&quot;");
    expect(html).toContain("&quot;location&quot;:&quot;/posts/hello?draft=1#intro&quot;");
    expect(html).toContain("&quot;isLoading&quot;:false");
    expect(html).toContain("&quot;isSubmitting&quot;:false");
    expect(html).toContain("&quot;isNavigating&quot;:false");
  });
});
