import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { hydratePage } from "../../src/lib/dom/client.ts";
import type { PageRouteRecord } from "../../src/lib/router/types.ts";
import * as PublicApi from "../../src/index.ts";

describe("hydratePage", () => {
  beforeEach(() => {
    ensureDocumentBody().innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    ensureDocumentBody().innerHTML = "";
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("hydrates the current route from the client runtime payload", async () => {
    const HelloPage = defineComponent({
      name: "HelloPage",
      setup() {
        return () => "hello hydrated page";
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: HelloPage,
            },
            children: [],
          },
        ],
      },
    ];

    window.history.replaceState({}, "", "/hello");
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

    expect(document.body.textContent).toContain("hello hydrated page");
  });

  it("hydrates against the document shell when app.shell is provided", async () => {
    const HelloPage = defineComponent({
      name: "HelloPage",
      setup() {
        return () => "hello document hydration";
      },
    });
    const AppShell = defineComponent({
      name: "AppShell",
      setup(_props, { slots }) {
        return () =>
          h("html", { lang: "en" }, [
            h("head", [h("title", "document shell")]),
            h("body", [slots.default?.()]),
          ]);
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: HelloPage,
            },
            children: [],
          },
        ],
      },
    ];

    window.history.replaceState({}, "", "/hello");
    document.documentElement.setAttribute("data-vuepagelet", "");
    document.documentElement.setAttribute("lang", "en");
    document.head.innerHTML = "<title>document shell</title>";
    document.body.innerHTML = "hello document hydration";
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
      app: {
        shell: AppShell,
      },
    });

    await hydrated.mount();

    expect(document.documentElement.getAttribute("data-vuepagelet")).toBe("");
    expect(document.body.textContent).toContain("hello document hydration");
  });

  it("applies deferred updates from the runtime subscription and unsubscribes on unmount", async () => {
    const DeferredPage = defineComponent({
      name: "DeferredPage",
      setup() {
        return () =>
          (window as Window & { __deferredValue?: string }).__deferredValue ?? "pending deferred";
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: DeferredPage,
            },
            children: [],
          },
        ],
      },
    ];

    const listeners: Array<(envelope: unknown) => void> = [];
    const unsubscribe = vi.fn();
    window.history.replaceState({}, "", "/hello");
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
      subscribe(listener: (envelope: unknown) => void) {
        listeners.push(listener);
        return unsubscribe;
      },
    });

    const hydrated = hydratePage({
      routes,
    });

    await hydrated.mount();
    (window as Window & { __deferredValue?: string }).__deferredValue = "streamed deferred";
    listeners[0]?.({
      type: "deferred",
      chunk: {
        routeId: "hello",
        key: "details",
        data: "streamed deferred",
      },
    });
    await Promise.resolve();

    expect(listeners).toHaveLength(1);
    hydrated.app.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("prefers hydration snapshot for initial state and merges runtime deferred errors after mount", async () => {
    const SnapshotPage = defineComponent({
      name: "SnapshotPage",
      setup() {
        return () =>
          (window as Window & { __loaderTitle?: string }).__loaderTitle ?? "loader missing";
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          error: defineComponent({
            name: "RootBoundary",
            props: {
              error: {
                type: null,
                default: null,
              },
            },
            setup(props) {
              return () =>
                typeof props.error === "object" && props.error !== null && "message" in props.error
                  ? String((props.error as { message: string }).message)
                  : String(props.error);
            },
          }),
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: SnapshotPage,
            },
            children: [],
          },
        ],
      },
    ];

    window.history.replaceState({}, "", "/hello");
    document.body.innerHTML = '<div data-vuepagelet-root="true"></div>';
    vi.stubGlobal("__VUEPAGELET__", {
      state: {
        loaderData: {
          hello: {
            title: "live loader",
          },
        },
        actionData: {},
        deferredData: {
          hello: {
            details: {
              title: "live deferred",
            },
          },
        },
        deferredErrors: {
          hello: {
            broken: {
              message: "live deferred error",
            },
          },
        },
        pendingDeferredKeys: {
          hello: ["details"],
        },
        routeErrors: {},
      },
      hydrationState: {
        loaderData: {
          hello: {
            title: "hydration loader",
          },
        },
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

    (window as Window & { __loaderTitle?: string }).__loaderTitle = "hydration loader";
    (window as Window & { __loaderTitle?: string }).__loaderTitle = "hydration loader";
    await hydrated.mount();

    const runtime = (
      window as Window & {
        __VUEPAGELET__?: {
          state?: {
            deferredData?: Record<string, Record<string, unknown>>;
            deferredErrors?: Record<string, Record<string, unknown>>;
            pendingDeferredKeys?: Record<string, string[]>;
          };
        };
      }
    ).__VUEPAGELET__;

    expect(runtime?.state?.deferredData).toEqual({
      hello: {
        details: {
          title: "live deferred",
        },
      },
    });
    expect(runtime?.state?.deferredErrors).toEqual({
      hello: {
        broken: {
          message: "live deferred error",
        },
      },
    });
    expect(runtime?.state?.pendingDeferredKeys).toEqual({
      hello: ["details"],
    });
    expect(document.body.textContent).toContain("live deferred error");
  });

  it("hydrates shared useState values from the client runtime snapshot", async () => {
    const CounterPage = defineComponent({
      name: "CounterPage",
      setup() {
        const useState = (
          PublicApi as {
            useState: <T>(key: string, initialValue?: T | (() => T)) => { value: T };
          }
        ).useState;
        const counter = useState<number>("counter", () => 0);

        return () => `counter: ${counter.value}`;
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: CounterPage,
            },
            children: [],
          },
        ],
      },
    ];

    window.history.replaceState({}, "", "/hello");
    document.body.innerHTML = '<div data-vuepagelet-root="true"></div>';
    vi.stubGlobal("__VUEPAGELET__", {
      state: {
        state: {
          counter: 5,
        },
        loaderData: {},
        actionData: {},
        deferredData: {},
        deferredErrors: {},
        pendingDeferredKeys: {},
        routeErrors: {},
      },
      hydrationState: {
        state: {
          counter: 5,
        },
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

    expect(document.body.textContent).toContain("counter: 5");
  });

  it("applies app runtime hot updates without a full reload", async () => {
    const InitialPage = defineComponent({
      name: "InitialPage",
      setup() {
        return () => "initial page";
      },
    });
    const UpdatedPage = defineComponent({
      name: "UpdatedPage",
      setup() {
        return () => "updated page";
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: InitialPage,
            },
            children: [],
          },
        ],
      },
    ];

    window.history.replaceState({}, "", "/hello");
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

    const applyHotUpdate = (
      window as Window & {
        __APP_RUNTIME_HMR__?: (payload: {
          appComponent?: unknown;
          routes?: PageRouteRecord[];
        }) => Promise<void> | void;
      }
    ).__APP_RUNTIME_HMR__;

    const nextRoutes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: defineComponent({
            name: "RootLayout",
            setup(_props, { slots }) {
              return () => slots.default?.();
            },
          }),
        },
        children: [
          {
            id: "hello",
            path: "hello",
            module: {
              component: UpdatedPage,
            },
            children: [],
          },
        ],
      },
    ];

    expect(typeof applyHotUpdate).toBe("function");

    await applyHotUpdate?.({
      routes: nextRoutes,
    });

    expect(ensureDocumentBody().textContent).toContain("updated page");
  });
});

function ensureDocumentBody(): HTMLBodyElement {
  const body = document.body ?? document.querySelector("body");
  if (body) {
    return body as HTMLBodyElement;
  }

  const createdBody = document.createElement("body");
  document.documentElement.append(createdBody);
  return createdBody;
}
