import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { RouterView } from "../../src/lib/dom/components/route-view.ts";
import { createHeadManager, headManagerKey } from "../../src/lib/dom/head.ts";
import { createRouteRuntimeIntegration } from "../../src/lib/integration/factory.ts";
import { matchPageRoute } from "../../src/lib/router/matcher.ts";
import { createPageRouter } from "../../src/lib/router/router.ts";
import { parseRuntimePayload } from "../../src/lib/runtime/serialization.ts";
import { createPageRuntimeState } from "../../src/lib/runtime/state.ts";
import { pageRuntimeStateKey } from "../../src/lib/runtime/types.ts";
import { app, routes } from "../../examples/todo-app/routes.ts";
import { resetTodoStore } from "../../examples/todo-app/store.ts";

async function mountAt(pathname: string) {
  const runtime = createRouteRuntimeIntegration({
    routes,
    app,
  });
  const initialResponse = await runtime.handleRequest(
    new Request(`http://local${pathname}`, {
      headers: {
        accept: "application/json",
      },
    }),
  );
  const initialPayload = parseRuntimePayload<{
    appData?: unknown;
    loaderData?: Record<string, unknown>;
    deferredData?: Record<string, Record<string, unknown>>;
    deferredErrors?: Record<string, Record<string, unknown>>;
    pendingDeferredKeys?: Record<string, string[]>;
    routeErrors?: Record<string, unknown>;
  }>(await initialResponse.text());

  window.history.replaceState({}, "", pathname);
  const match = matchPageRoute(window.location.href, routes);
  if (!match) {
    throw new Error(`route match not found for ${pathname}`);
  }

  const state = createPageRuntimeState(match, routes);
  state.appData = initialPayload.appData ?? null;
  state.loaderData = initialPayload.loaderData ?? {};
  state.deferredData = initialPayload.deferredData ?? {};
  state.deferredErrors = initialPayload.deferredErrors ?? {};
  state.pendingDeferredKeys = initialPayload.pendingDeferredKeys ?? {};
  state.routeErrors = initialPayload.routeErrors ?? {};

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(
            input instanceof URL ? input.href : input,
            init,
          );

    return runtime.handleRequest(request);
  });

  vi.stubGlobal("fetch", fetchMock);

  const container = document.createElement("div");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.body.appendChild(container);

  const appInstance = createApp(
    defineComponent({
      name: "TodoHeadBrowserHarness",
      setup() {
        return () =>
          h(app.shell as never, null, {
            default: () => h(RouterView),
          });
      },
    }),
  );
  const router = createPageRouter({
    routes,
    state,
  });
  const headManager = createHeadManager();

  appInstance.use(router);
  appInstance.provide(pageRuntimeStateKey, state);
  appInstance.provide(headManagerKey, headManager);
  await router.push(pathname);
  await router.isReady();
  appInstance.mount(container);
  headManager.connectDocument(document);
  await nextTick();

  return { appInstance, container, headManager };
}

describe("todo app head", () => {
  beforeEach(() => {
    resetTodoStore();
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-head-mode");
    document.body.removeAttribute("data-head-state");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-head-mode");
    document.body.removeAttribute("data-head-state");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("manages dedicated /head tags and updates html/body attrs after hydration", async () => {
    const { appInstance, container, headManager } = await mountAt("/head");

    expect(document.title).toBe("Head | Todo Showcase");
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBe("Head showcase route for runtime document management.");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://example.test/todo-showcase/head",
    );
    expect(document.head.querySelector('style[data-head-style="showcase"]')?.textContent).toContain(
      ".head-preview-live",
    );
    expect(
      document.head
        .querySelector('script[type="application/json"][data-head-script="showcase"]')
        ?.textContent,
    ).toContain('"route":"head"');
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.documentElement.getAttribute("data-head-mode")).toBe("overview");
    expect(document.body.getAttribute("data-head-state")).toBe("idle");

    const toggleButton = container.querySelector('button[data-testid="head-mode-toggle"]');
    if (!(toggleButton instanceof HTMLButtonElement)) {
      throw new Error("head mode toggle button not found");
    }
    toggleButton.click();

    await vi.waitFor(() => {
      expect(document.title).toBe("Head | Todo Showcase");
      expect(
        document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
      ).toBe("Head showcase route after hydration updates.");
      expect(document.documentElement.getAttribute("lang")).toBe("fr");
      expect(document.documentElement.getAttribute("data-head-mode")).toBe("live");
      expect(document.body.getAttribute("data-head-state")).toBe("interactive");
      expect(container.textContent).toContain("Live head state active");
    });

    headManager.disconnectDocument();
    appInstance.unmount();
  });
});
