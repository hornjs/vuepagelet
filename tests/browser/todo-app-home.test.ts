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
  document.body.innerHTML = "";
  document.body.appendChild(container);

  const appInstance = createApp(
    defineComponent({
      name: "TodoAppBrowserHarness",
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
  await nextTick();

  return { appInstance, container };
}

describe("todo app home", () => {
  beforeEach(() => {
    resetTodoStore();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("renders seeded todos and supports create, toggle, and clear completed flows", async () => {
    const { appInstance, container } = await mountAt("/");

    expect(container.textContent).toContain("Ship showcase");
    expect(container.textContent).toContain("Draft roadmap");

    const titleInput = container.querySelector('input[name="title"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      throw new Error("title input not found");
    }
    titleInput.value = "new task title";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));

    const createForm = container.querySelector('form[data-testid="todo-create-form"]');
    if (!(createForm instanceof HTMLFormElement)) {
      throw new Error("create form not found");
    }
    createForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(container.textContent).toContain("new task title");
    });

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Toggle Ship showcase"),
    );
    if (!(toggleButton instanceof HTMLButtonElement)) {
      throw new Error("toggle button not found");
    }
    toggleButton.click();

    await vi.waitFor(() => {
      expect(container.textContent).toContain("1 completed");
    });

    const clearButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Clear completed"),
    );
    if (!(clearButton instanceof HTMLButtonElement)) {
      throw new Error("clear completed button not found");
    }
    clearButton.click();

    await vi.waitFor(() => {
      expect(container.textContent).not.toContain("Ship showcase");
      expect(container.textContent).toContain("new task title");
    });

    appInstance.unmount();
  });
});
