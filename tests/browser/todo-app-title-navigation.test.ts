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
import { listTodos, resetTodoStore } from "../../examples/todo-app/store.ts";

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
        : new Request(input instanceof URL ? input.href : input, init);

    return runtime.handleRequest(request);
  });

  vi.stubGlobal("fetch", fetchMock);

  const container = document.createElement("div");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.body.appendChild(container);

  const appInstance = createApp(
    defineComponent({
      name: "TodoTitleNavigationHarness",
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

  return { appInstance, router, headManager };
}

describe("todo app route titles", () => {
  beforeEach(() => {
    resetTodoStore();
    document.documentElement.removeAttribute("lang");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("lang");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("updates document.title when navigating between showcase routes", async () => {
    const todo = listTodos()[0];
    if (!todo) {
      throw new Error("seeded todo not found");
    }

    const { appInstance, router, headManager } = await mountAt("/");

    expect(document.title).toBe("Overview | Todo Showcase");

    await router.push(`/tasks/${todo.id}`);
    await nextTick();

    await vi.waitFor(() => {
      expect(document.title).toBe(`Task: ${todo.title} | Todo Showcase`);
    });

    await router.push("/errors");
    await nextTick();

    await vi.waitFor(() => {
      expect(document.title).toBe("Errors | Todo Showcase");
    });

    headManager.disconnectDocument();
    appInstance.unmount();
  });
});
