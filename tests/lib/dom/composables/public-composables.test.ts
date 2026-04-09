import { renderToString } from "@vue/server-renderer";
import { createSSRApp, defineComponent, h } from "vue";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import { useActionData } from "../../../../src/lib/dom/composables/use-action-data.ts";
import { useNavigation } from "../../../../src/lib/dom/composables/use-navigation.ts";
import { useFetcher } from "../../../../src/lib/dom/composables/use-fetcher.ts";
import { useFormAction } from "../../../../src/lib/dom/composables/use-form-action.ts";
import { RouterView } from "../../../../src/lib/dom/components/route-view.ts";
import { createPageRouter } from "../../../../src/lib/router/router.ts";
import type { PageRouteRecord } from "../../../../src/lib/router/types.ts";
import { createPageRuntimeState } from "../../../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../../../src/lib/runtime/types.ts";

describe("public composables", () => {
  it("resolves useFormAction to the current route path by default", async () => {
    let resolvedAction = "";
    const Probe = defineComponent({
      name: "FormActionProbe",
      setup() {
        resolvedAction = useFormAction().value;
        return () => h("div");
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
            id: "post-detail",
            path: "posts/:slug",
            module: {
              component: Probe,
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

    await router.push("/posts/hello");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    await renderToString(app);

    expect(resolvedAction).toBe("/posts/hello");
  });

  it("exposes useFetcher state and useActionData/useNavigation values directly", async () => {
    let snapshot: Record<string, unknown> | null = null;
    const Probe = defineComponent({
      name: "ComposableStateProbe",
      setup() {
        const actionData = useActionData<{ saved: boolean }>();
        const navigation = useNavigation();
        const fetcher = useFetcher<{ saved: boolean }>();

        snapshot = {
          actionData: actionData.value,
          navigationState: navigation.state.value,
          navigationLocation: navigation.location.value,
          isSubmitting: navigation.isSubmitting.value,
          fetcherState: fetcher.state.value,
          fetcherData: fetcher.data.value,
          fetcherFormAction: fetcher.formAction.value,
          fetcherFormMethod: fetcher.formMethod.value,
        };

        return () => h("div");
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
            id: "post-detail",
            path: "posts/:slug",
            module: {
              component: Probe,
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
    state.actionData = {
      "post-detail": {
        saved: true,
      },
    };
    state.transitionState.value = {
      ...state.transitionState.value,
      state: "submitting",
      location: "/posts/hello",
      previousLocation: "/",
      action: "push",
      isReady: false,
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

    await router.push("/posts/hello");
    await router.isReady();
    app.use(router);
    app.provide(pageRuntimeStateKey, state);
    await renderToString(app);

    expect(snapshot).toEqual({
      actionData: {
        saved: true,
      },
      navigationState: "idle",
      navigationLocation: "/posts/hello",
      isSubmitting: false,
      fetcherState: "idle",
      fetcherData: null,
      fetcherFormAction: "",
      fetcherFormMethod: "post",
    });
  });
});
