import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { currentRouteRecordKey } from "../../../../src/lib/dom/composables/use-route.ts";
import {
  useDeferredData,
  useDeferredError,
  useRouteLoaderData,
} from "../../../../src/lib/dom/composables/use-loader-data.ts";
import { pageRuntimeStateKey } from "../../../../src/lib/runtime/types.ts";
import type { PageRuntimeState } from "../../../../src/lib/runtime/types.ts";
import { createTransitionState } from "../../../../src/lib/runtime/transition-manager.ts";
import type { PageRouteRecord } from "../../../../src/lib/router/types.ts";

function createRoute(id: string, path: string): PageRouteRecord {
  return {
    id,
    path,
    module: {},
    children: [],
  };
}

describe("useRouteLoaderData", () => {
  it("reads loader data for a parent route id from a child route context", async () => {
    const root = createRoute("root", "/");
    const posts = createRoute("posts", "posts");
    const postDetail = createRoute("post-detail", ":slug");

    const state: PageRuntimeState = {
      routes: [root],
      route: {
        route: postDetail,
        matches: [root, posts, postDetail],
        params: {
          slug: "hello",
        },
        pathname: "/posts/hello",
        query: {},
        hash: "",
      },
      transitionState: createTransitionState("/posts/hello"),
      appData: null,
      appError: null,
      loaderData: {
        posts: {
          title: "Posts layout data",
        },
        "post-detail": {
          slug: "hello",
        },
      },
      actionData: {},
      deferredData: {},
      deferredErrors: {},
      pendingDeferredKeys: {},
      revalidatingRouteIds: [],
      routeErrors: {},
    };

    const Probe = defineComponent({
      name: "Probe",
      setup() {
        const parentLoaderData = useRouteLoaderData<{ title: string }>("posts");
        return () => h("pre", JSON.stringify(parentLoaderData.value));
      },
    });

    const app = createSSRApp({
      setup() {
        return () => h(Probe);
      },
    });

    app.provide(pageRuntimeStateKey, state);
    app.provide(currentRouteRecordKey, postDetail);

    const html = await renderToString(app);
    expect(html).toContain("{&quot;title&quot;:&quot;Posts layout data&quot;}");
  });

  it("reads deferred data and deferred errors for the current route", async () => {
    const postDetail = createRoute("post-detail", ":slug");

    const state: PageRuntimeState = {
      routes: [postDetail],
      route: {
        route: postDetail,
        matches: [postDetail],
        params: {
          slug: "hello",
        },
        pathname: "/posts/hello",
        query: {},
        hash: "",
      },
      transitionState: createTransitionState("/posts/hello"),
      appData: null,
      appError: null,
      loaderData: {},
      actionData: {},
      deferredData: {
        "post-detail": {
          slowBlock: {
            title: "Deferred content",
          },
        },
      },
      deferredErrors: {
        "post-detail": {
          failingBlock: {
            message: "Deferred failed",
          },
        },
      },
      pendingDeferredKeys: {},
      revalidatingRouteIds: [],
      routeErrors: {},
    };

    const Probe = defineComponent({
      name: "DeferredProbe",
      setup() {
        const deferredData = useDeferredData<{ title: string }>("slowBlock");
        const deferredError = useDeferredError<{ message: string }>("failingBlock");
        return () =>
          h(
            "pre",
            JSON.stringify({
              deferredData: deferredData.value,
              deferredError: deferredError.value,
            }),
          );
      },
    });

    const app = createSSRApp({
      setup() {
        return () => h(Probe);
      },
    });

    app.provide(pageRuntimeStateKey, state);
    app.provide(currentRouteRecordKey, postDetail);

    const html = await renderToString(app);
    expect(html).toContain("&quot;title&quot;:&quot;Deferred content&quot;");
    expect(html).toContain("&quot;message&quot;:&quot;Deferred failed&quot;");
  });
});
