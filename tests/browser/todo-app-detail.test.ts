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
      name: "TodoAppDetailHarness",
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

describe("todo app detail", () => {
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

  it("shows detail data, persists edits, and returns home after delete", async () => {
    const todo = listTodos()[0];
    if (!todo) {
      throw new Error("seeded todo not found");
    }

    const { appInstance, container } = await mountAt(`/tasks/${todo.id}`);

    expect(container.textContent).toContain("Ship showcase");
    expect(container.textContent).toContain(
      "Land the home dashboard interactions without disturbing later routes.",
    );

    const titleInput = container.querySelector('input[name="title"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      throw new Error("detail title input not found");
    }
    titleInput.value = "Ship showcase detail";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));

    const descriptionInput = container.querySelector('textarea[name="description"]');
    if (!(descriptionInput instanceof HTMLTextAreaElement)) {
      throw new Error("detail description textarea not found");
    }
    descriptionInput.value = "Detail route edits should persist in memory.";
    descriptionInput.dispatchEvent(new Event("input", { bubbles: true }));

    const editForm = container.querySelector('form[data-testid="todo-detail-form"]');
    if (!(editForm instanceof HTMLFormElement)) {
      throw new Error("detail form not found");
    }
    editForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Ship showcase detail");
      expect(container.textContent).toContain("Detail route edits should persist in memory.");
    });

    const deleteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Delete task"),
    );
    if (!(deleteButton instanceof HTMLButtonElement)) {
      throw new Error("delete task button not found");
    }
    deleteButton.click();

    await vi.waitFor(() => {
      expect(window.location.pathname).toBe("/");
      expect(container.textContent).not.toContain("Ship showcase detail");
      expect(container.textContent).toContain("Draft roadmap");
    });

    appInstance.unmount();
  });
});
