import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, onMounted, ref } from "vue";
import { hydratePage } from "../../src/lib/dom/client.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";
import * as PublicApi from "../../src/index.ts";

describe("head runtime", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-vuepagelet");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-theme");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-vuepagelet");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-theme");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("hydrates head updates and renders ClientOnly and DevOnly on the client", async () => {
    const HeadPage = defineComponent({
      name: "HeadPage",
      setup() {
        const counter = ref(0);

        PublicApi.useHead(() => ({
          title: `counter ${counter.value}`,
          meta: [{ name: "description", content: `value ${counter.value}` }],
          htmlAttrs: {
            lang: counter.value === 0 ? "en" : "fr",
          },
          bodyAttrs: {
            "data-count": String(counter.value),
          },
        }));

        onMounted(() => {
          counter.value = 1;
        });

        return () =>
          h("section", [
            h(PublicApi.ClientOnly, null, {
              default: () => h("div", { id: "client-only" }, "client only ready"),
              fallback: () => h("div", { id: "client-fallback" }, "client fallback"),
            }),
            h(PublicApi.DevOnly, null, {
              default: () => h("div", { id: "dev-only" }, "dev only ready"),
            }),
          ]);
      },
    });

    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: HeadPage,
        },
        children: [],
      },
    ];

    document.body.innerHTML = '<div data-vuepagelet-root="true"></div>';
    vi.stubGlobal("__VUEPAGELET__", {
      state: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      hydrationState: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      subscribe() {
        return () => {};
      },
    });

    const hydrated = hydratePage({
      routes,
    });

    await hydrated.mount();
    await nextTick();

    expect(document.title).toBe("counter 1");
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
    expect(document.body.getAttribute("data-count")).toBe("1");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "value 1",
    );
    expect(document.querySelector("#client-only")?.textContent).toBe("client only ready");
    expect(document.querySelector("#client-fallback")).toBeNull();
    expect(document.querySelector("#dev-only")?.textContent).toBe("dev only ready");

    hydrated.app.unmount();
  });

  it("replaces an existing unmanaged document title when managed head state is connected", async () => {
    const HeadPage = defineComponent({
      name: "StaticTitleReplacementPage",
      setup() {
        PublicApi.useTitle("managed replacement");

        return () => h("section", "head replacement");
      },
    });

    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: HeadPage,
        },
        children: [],
      },
    ];

    document.head.innerHTML = "<title>shell fallback</title>";
    document.body.innerHTML = '<div data-vuepagelet-root="true"></div>';
    vi.stubGlobal("__VUEPAGELET__", {
      state: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      hydrationState: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      subscribe() {
        return () => {};
      },
    });

    const hydrated = hydratePage({
      routes,
    });

    await hydrated.mount();
    await nextTick();

    expect(document.title).toBe("managed replacement");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe("managed replacement");

    hydrated.app.unmount();
  });

  it("reuses the existing title element and updates its text instead of replacing it", async () => {
    const HeadPage = defineComponent({
      name: "StableTitlePage",
      setup() {
        const title = ref("managed replacement");

        PublicApi.useTitle(() => title.value);

        onMounted(() => {
          title.value = "managed after mount";
        });

        return () => h("section", "stable title");
      },
    });

    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: HeadPage,
        },
        children: [],
      },
    ];

    document.head.innerHTML = "<title>shell fallback</title>";
    const initialTitleElement = document.head.querySelector("title");
    document.body.innerHTML = '<div data-vuepagelet-root="true"></div>';
    vi.stubGlobal("__VUEPAGELET__", {
      state: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      hydrationState: {
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      subscribe() {
        return () => {};
      },
    });

    const hydrated = hydratePage({
      routes,
    });

    await hydrated.mount();
    await nextTick();

    const hydratedTitleElement = document.head.querySelector("title");
    expect(hydratedTitleElement).toBe(initialTitleElement);
    expect(document.title).toBe("managed after mount");
    expect(hydratedTitleElement?.textContent).toBe("managed after mount");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);

    hydrated.app.unmount();
  });
});
