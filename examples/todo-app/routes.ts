import { defineComponent, h, ref } from "vue";
import type { AppModule, PageRouteRecord } from "vuepagelet/integration";
import {
  RouterLink,
  updateHead,
  useAppData,
  useFormAction,
  useHead,
  useLink,
  useLoaderData,
  useMeta,
  useRoute,
  useRouter,
  useScript,
  useStyle,
  useSubmit,
  useTitle,
} from "vuepagelet";
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "./store.ts";
import { todoShowcaseStyleSheet } from "./styles.ts";

const showcaseSections = [
  {
    id: "home",
    path: "/",
    label: "Overview",
    eyebrow: "Shell",
    title: "Todo showcase launchpad",
    description:
      "The shared shell frames every demo route with the same editorial look, navigation model, and global app data.",
  },
  {
    id: "tasks-demo",
    path: "/tasks/demo",
    label: "Tasks Demo",
    eyebrow: "Flows",
    title: "Task interactions route",
    description:
      "Later tasks will wire the list, forms, and mutations into this route without changing the shell contract.",
  },
  {
    id: "head",
    path: "/head",
    label: "Head",
    eyebrow: "Document",
    title: "Managed head route",
    description:
      "Reserved for metadata, document attributes, and client-only showcase content in a later task.",
  },
  {
    id: "deferred",
    path: "/deferred",
    label: "Deferred",
    eyebrow: "Streaming",
    title: "Deferred data route",
    description:
      "This surface will demonstrate pending states and streamed payloads after the shell foundation is in place.",
  },
  {
    id: "errors",
    path: "/errors",
    label: "Errors",
    eyebrow: "Boundaries",
    title: "Route and app error route",
    description:
      "Placeholder content for the error boundary scenarios that arrive in the later showcase tasks.",
  },
  {
    id: "debug",
    path: "/debug",
    label: "Debug",
    eyebrow: "Devtools",
    title: "Debug instrumentation route",
    description:
      "Reserved for inspection-oriented output so the shell can advertise the route now without preempting its behavior.",
  },
] as const;

type ShowcaseSection = (typeof showcaseSections)[number];

const TodoShowcaseShell = defineComponent({
  name: "TodoShowcaseShell",
  setup(_props, { slots }) {
    const appData = useAppData<{
      requestPath: string;
      todoCount: number;
    }>();

    return () =>
      h("html", { lang: "en", "data-allow-mismatch": "children" }, [
        h("head", { "data-allow-mismatch": "children" }, [
          h("meta", { charset: "utf-8" }),
          h("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1.0",
          }),
          h("title", "Todo Showcase"),
          h("style", todoShowcaseStyleSheet),
        ]),
        h("body", { "data-allow-mismatch": "children" }, [
          h("div", { class: "todo-shell" }, [
            h("header", { class: "todo-hero" }, [
              h("div", { class: "todo-kicker" }, "Vuepagelet example"),
              h("h1", { class: "todo-title" }, "Todo Showcase"),
              h(
                "p",
                { class: "todo-subtitle" },
                "A single shell for routing, document management, deferred work, errors, and debug-friendly todo flows.",
              ),
              h("div", { class: "todo-status-row" }, [
                h("span", { class: "todo-chip" }, `request ${appData.value?.requestPath ?? "/"}`),
                h("span", { class: "todo-chip" }, `seeded todos ${appData.value?.todoCount ?? 0}`),
                h("span", { class: "todo-chip" }, "shell-first rollout"),
              ]),
            ]),
            h(
              "nav",
              { class: "todo-nav", "aria-label": "Todo showcase sections" },
              showcaseSections.map((section) =>
                h(
                  RouterLink,
                  {
                    to: section.path,
                    class: "todo-nav-link",
                    exactActiveClass: "router-link-exact-active",
                    activeClass: "router-link-active",
                  },
                  () => [
                    h("span", { class: "todo-nav-label" }, section.label),
                    h("span", { class: "todo-nav-path" }, section.path),
                  ],
                ),
              ),
            ),
            h("main", slots.default ? slots.default() : []),
          ]),
        ]),
      ]);
  },
});

const TodoShowcasePage = defineComponent({
  name: "TodoShowcasePage",
  props: {
    section: {
      type: Object as () => ShowcaseSection,
      required: false,
      default: undefined,
    },
  },
  setup(props) {
    const route = useRoute();
    const fallbackSection = () =>
      showcaseSections.find((section) => section.path === route.value.path) ?? showcaseSections[0]!;

    const activeSection = () => props.section ?? fallbackSection();

    useTitle(() => `${activeSection().label} | Todo Showcase`);

    return () =>
      h("div", { class: "todo-grid" }, [
        h("section", { class: "todo-panel" }, [
          h("div", { class: "todo-kicker" }, activeSection().eyebrow),
          h("h2", activeSection().title),
          h("p", { class: "todo-copy" }, activeSection().description),
          h("ul", { class: "todo-bullets" }, [
            h("li", "Shared document shell, hero framing, and route navigation are active now."),
            h("li", "Route-specific demo behavior is intentionally deferred to later tasks."),
            h("li", `Current in-memory todo count: ${listTodos().length}.`),
          ]),
        ]),
        h("aside", { class: "todo-stack" }, [
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Status"),
            h("h3", "Shell-level implementation"),
            h(
              "p",
              null,
              "This route is present so the top navigation and shared visual system can stabilize before feature demos land.",
            ),
          ]),
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Next"),
            h("h3", "Behavior arrives later"),
            h(
              "p",
              null,
              "Upcoming tasks will turn these placeholders into head-management, deferred-data, error, and debug showcases.",
            ),
          ]),
        ]),
      ]);
  },
});

const TodoHomePage = defineComponent({
  name: "TodoHomePage",
  setup() {
    const loaderData = useLoaderData<{
      todos: Array<{
        id: string;
        title: string;
        description: string;
        done: boolean;
        priority: "low" | "medium" | "high";
      }>;
      summary: {
        total: number;
        completed: number;
        remaining: number;
      };
    }>();
    const submit = useSubmit();
    const formAction = useFormAction();
    const title = ref("");
    const description = ref("");
    const priority = ref<"low" | "medium" | "high">("medium");

    useTitle("Overview | Todo Showcase");

    async function handleCreate(event: SubmitEvent) {
      event.preventDefault();

      if (!title.value.trim()) {
        return;
      }

      await submit(
        {
          intent: "create",
          title: title.value,
          description: description.value,
          priority: priority.value,
        },
        {
          action: formAction.value,
          method: "post",
        },
      );

      title.value = "";
      description.value = "";
      priority.value = "medium";
    }

    async function handleToggle(id: string) {
      await submit(
        {
          intent: "toggle",
          id,
        },
        {
          action: formAction.value,
          method: "post",
        },
      );
    }

    async function handleClearCompleted() {
      await submit(
        {
          intent: "clear-completed",
        },
        {
          action: formAction.value,
          method: "post",
        },
      );
    }

    return () => {
      const data = loaderData.value ?? {
        todos: [],
        summary: {
          total: 0,
          completed: 0,
          remaining: 0,
        },
      };

      return h("div", { class: "todo-grid" }, [
        h("section", { class: "todo-panel" }, [
          h("div", { class: "todo-kicker" }, "Home dashboard"),
          h("h2", "Today’s board"),
          h(
            "p",
            { class: "todo-copy" },
            "Seeded in-memory work items prove the home route loader/action cycle before later showcase routes come online.",
          ),
          h("div", { class: "todo-status-row" }, [
            h("span", { class: "todo-chip" }, `${data.summary.total} total`),
            h("span", { class: "todo-chip" }, `${data.summary.remaining} remaining`),
            h("span", { class: "todo-chip" }, `${data.summary.completed} completed`),
          ]),
          h(
            "form",
            {
              method: "post",
              action: formAction.value,
              "data-testid": "todo-create-form",
              onSubmit: handleCreate,
              style: "display:grid;gap:12px;margin-top:20px;",
            },
            [
              h("input", {
                name: "title",
                value: title.value,
                placeholder: "Add a new task",
                onInput: (event: Event) => {
                  title.value = (event.target as HTMLInputElement | null)?.value ?? "";
                },
                style:
                  "width:100%;padding:13px 14px;border-radius:16px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.9);color:inherit;",
              }),
              h("textarea", {
                name: "description",
                value: description.value,
                rows: 3,
                placeholder: "Optional context",
                onInput: (event: Event) => {
                  description.value = (event.target as HTMLTextAreaElement | null)?.value ?? "";
                },
                style:
                  "width:100%;padding:13px 14px;border-radius:16px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.9);color:inherit;resize:vertical;",
              }),
              h(
                "div",
                {
                  style:
                    "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;",
                },
                [
                  h(
                    "select",
                    {
                      name: "priority",
                      value: priority.value,
                      onChange: (event: Event) => {
                        priority.value = (
                          (event.target as HTMLSelectElement | null)?.value ?? "medium"
                        ) as "low" | "medium" | "high";
                      },
                      style:
                        "padding:12px 14px;border-radius:16px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.9);color:inherit;",
                    },
                    ["low", "medium", "high"].map((value) =>
                      h(
                        "option",
                        {
                          value,
                        },
                        value,
                      ),
                    ),
                  ),
                  h(
                    "button",
                    {
                      type: "submit",
                      style:
                        "padding:12px 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#22d3ee,#f59e0b);color:#08111f;font-weight:700;cursor:pointer;",
                    },
                    "Create todo",
                  ),
                ],
              ),
            ],
          ),
          h(
            "div",
            {
              style:
                "display:grid;gap:12px;margin-top:20px;",
            },
            data.todos.map((todo) =>
              h(
                "article",
                {
                  style:
                    "padding:16px;border-radius:18px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.72);",
                },
                [
                  h(
                    "div",
                    {
                      style:
                        "display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;",
                    },
                    [
                      h("div", [
                        h(
                          RouterLink,
                          {
                            to: `/tasks/${todo.id}`,
                            style:
                              "display:inline-block;margin:0 0 6px;color:inherit;font-size:1.2rem;font-weight:700;text-decoration:none;",
                          },
                          () =>
                            h(
                              "span",
                              {
                                style: `text-decoration:${todo.done ? "line-through" : "none"};`,
                              },
                              todo.title,
                            ),
                        ),
                        h("p", { class: "todo-copy" }, todo.description || "No description yet."),
                      ]),
                      h("span", { class: "todo-chip" }, todo.priority),
                    ],
                  ),
                  h(
                    "div",
                    {
                      style:
                        "display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;",
                    },
                    [
                      h(
                        "span",
                        { class: "todo-kicker" },
                        todo.done ? "Completed" : "Active",
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: () => void handleToggle(todo.id),
                          style:
                            "padding:10px 14px;border-radius:999px;border:1px solid rgba(138, 179, 255, 0.22);background:rgba(21,39,61,0.85);color:inherit;cursor:pointer;",
                        },
                        `Toggle ${todo.title}`,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ]),
        h("aside", { class: "todo-stack" }, [
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Actions"),
            h("h3", "Home route mutations"),
            h(
              "p",
              null,
              "Create, toggle, and clear-completed all post back into this route and revalidate the home loader in place.",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => void handleClearCompleted(),
                style:
                  "padding:12px 16px;border-radius:999px;border:1px solid rgba(138, 179, 255, 0.22);background:rgba(21,39,61,0.85);color:inherit;cursor:pointer;",
              },
              "Clear completed",
            ),
          ]),
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Scope"),
            h("h3", "Later routes stay untouched"),
            h(
              "p",
              null,
              "Detail, head, deferred, error, and debug routes remain placeholders so this task only establishes the home dashboard flow.",
            ),
          ]),
        ]),
      ]);
    };
  },
});

const TodoDetailPage = defineComponent({
  name: "TodoDetailPage",
  setup() {
    const loaderData = useLoaderData<{
      todo: {
        id: string;
        title: string;
        description: string;
        done: boolean;
        priority: "low" | "medium" | "high";
        createdAt: string;
      } | null;
    }>();
    const formAction = useFormAction();
    const submit = useSubmit();
    const route = useRoute();
    const router = useRouter();

    useTitle(() => {
      const todoTitle = loaderData.value?.todo?.title?.trim();
      return `Task: ${todoTitle || "Missing task"} | Todo Showcase`;
    });

    async function handleUpdate(event: SubmitEvent) {
      event.preventDefault();

      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const formData = new FormData(form);
      await submit(formData, {
        action: formAction.value,
        method: "post",
      });
    }

    async function handleDelete() {
      const id = String(route.value.params.id ?? "");
      const result = await submit(
        {
          intent: "delete",
          id,
        },
        {
          action: formAction.value,
          method: "post",
        },
      );

      if (result.ok) {
        await router.push("/");
      }
    }

    return () => {
      const todo = loaderData.value?.todo ?? null;

      if (!todo) {
        return h("div", { class: "todo-grid" }, [
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Task detail"),
            h("h2", "Task not found"),
            h(
              "p",
              { class: "todo-copy" },
              "This in-memory task no longer exists. Return to the dashboard to continue.",
            ),
            h(
              RouterLink,
              {
                to: "/",
                style:
                  "display:inline-flex;align-items:center;gap:8px;margin-top:18px;color:inherit;text-decoration:none;font-weight:700;",
              },
              () => "Back to dashboard",
            ),
          ]),
        ]);
      }

      return h("div", { class: "todo-grid" }, [
        h("section", { class: "todo-panel" }, [
          h("div", { class: "todo-kicker" }, "Task detail"),
          h("h2", todo.title),
          h(
            "p",
            { class: "todo-copy" },
            "The detail route reads a single todo from the shared in-memory store and posts updates back into the same record.",
          ),
          h("div", { class: "todo-status-row" }, [
            h("span", { class: "todo-chip" }, todo.priority),
            h("span", { class: "todo-chip" }, todo.done ? "completed" : "active"),
            h("span", { class: "todo-chip" }, `created ${todo.createdAt.slice(0, 10)}`),
          ]),
          h(
            "form",
            {
              method: "post",
              action: formAction.value,
              "data-testid": "todo-detail-form",
              onSubmit: handleUpdate,
              style: "display:grid;gap:12px;margin-top:20px;",
            },
            [
              h("input", {
                name: "intent",
                type: "hidden",
                value: "update",
              }),
              h("input", {
                name: "id",
                type: "hidden",
                value: todo.id,
              }),
              h("input", {
                name: "title",
                value: todo.title,
                style:
                  "width:100%;padding:13px 14px;border-radius:16px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.9);color:inherit;",
              }),
              h("textarea", {
                name: "description",
                value: todo.description,
                rows: 5,
                style:
                  "width:100%;padding:13px 14px;border-radius:16px;border:1px solid rgba(138, 179, 255, 0.18);background:rgba(8,17,31,0.9);color:inherit;resize:vertical;",
              }),
              h(
                "div",
                {
                  style:
                    "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;",
                },
                [
                  h(
                    RouterLink,
                    {
                      to: "/",
                      style:
                        "display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-weight:700;",
                    },
                    () => "Back to dashboard",
                  ),
                  h(
                    "div",
                    {
                      style: "display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-end;",
                    },
                    [
                      h(
                        "button",
                        {
                          type: "submit",
                          style:
                            "padding:12px 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#22d3ee,#f59e0b);color:#08111f;font-weight:700;cursor:pointer;",
                        },
                        "Save changes",
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: () => void handleDelete(),
                          style:
                            "padding:12px 18px;border-radius:999px;border:1px solid rgba(248, 113, 113, 0.35);background:rgba(69, 19, 33, 0.85);color:#fca5a5;font-weight:700;cursor:pointer;",
                        },
                        "Delete task",
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ]),
        h("aside", { class: "todo-stack" }, [
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Route"),
            h("h3", "Selected task metadata"),
            h("p", null, todo.description || "No description yet."),
          ]),
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Navigation"),
            h("h3", "Typed route link flow"),
            h(
              "p",
              null,
              "The dashboard links into this detail route and delete returns you back to the home list without touching other showcase routes.",
            ),
          ]),
        ]),
      ]);
    };
  },
});

const TodoHeadPage = defineComponent({
  name: "TodoHeadPage",
  setup() {
    const liveMode = ref(false);
    const attrs = updateHead({
      htmlAttrs: {
        lang: "en",
        "data-head-mode": "overview",
      },
      bodyAttrs: {
        "data-head-state": "idle",
      },
    });

    useTitle("Head | Todo Showcase");
    useMeta(() => [
      {
        name: "description",
        content: liveMode.value
          ? "Head showcase route after hydration updates."
          : "Head showcase route for runtime document management.",
      },
    ]);
    useLink([
      {
        rel: "canonical",
        href: "https://example.test/todo-showcase/head",
      },
    ]);
    useStyle([
      {
        "data-head-style": "showcase",
        children:
          ".head-preview-live{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(34,211,238,0.14);color:#67e8f9;font-weight:700;}",
      },
    ]);
    useScript(() => [
      {
        type: "application/json",
        "data-head-script": "showcase",
        children: JSON.stringify({
          route: "head",
          mode: liveMode.value ? "live" : "overview",
        }),
      },
    ]);
    useHead(() => ({
      meta: [
        {
          property: "og:title",
          content: liveMode.value ? "Head showcase live" : "Head showcase",
        },
      ],
    }));

    function handleToggle() {
      liveMode.value = !liveMode.value;
      attrs.update({
        htmlAttrs: {
          lang: liveMode.value ? "fr" : "en",
          "data-head-mode": liveMode.value ? "live" : "overview",
        },
        bodyAttrs: {
          "data-head-state": liveMode.value ? "interactive" : "idle",
        },
      });
    }

    return () =>
      h("div", { class: "todo-grid" }, [
        h("section", { class: "todo-panel" }, [
          h("div", { class: "todo-kicker" }, "Head showcase"),
          h("h2", "Managed document state"),
          h(
            "p",
            { class: "todo-copy" },
            "This route binds every head API to a single page and flips document attributes after hydration.",
          ),
          h("div", { class: "todo-status-row" }, [
            h("span", { class: "todo-chip" }, "useHead"),
            h("span", { class: "todo-chip" }, "useTitle/meta/link/style/script"),
            h("span", { class: "todo-chip" }, "updateHead"),
          ]),
          h(
            "button",
            {
              type: "button",
              "data-testid": "head-mode-toggle",
              onClick: handleToggle,
              style:
                "margin-top:20px;padding:12px 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#22d3ee,#f59e0b);color:#08111f;font-weight:700;cursor:pointer;",
            },
            liveMode.value ? "Return to overview head state" : "Activate live head state",
          ),
        ]),
        h("aside", { class: "todo-stack" }, [
          h("section", { class: "todo-panel" }, [
            h("div", { class: "todo-kicker" }, "Current mode"),
            h("h3", liveMode.value ? "Live head state active" : "Overview head state active"),
            h(
              "p",
              null,
              liveMode.value
                ? "The hydrated interaction switched title, description, script payload, and html/body attributes."
                : "Server-rendered head entries are active before the route receives any client interaction.",
            ),
            h(
              "div",
              {
                class: liveMode.value ? "head-preview-live" : "todo-chip",
                style: liveMode.value ? undefined : "display:inline-flex;",
              },
              liveMode.value ? "Hydrated head update applied" : "SSR head snapshot applied",
            ),
          ]),
        ]),
      ]);
  },
});

const TodoRouteLayout = defineComponent({
  name: "TodoRouteLayout",
  props: {
    matches: {
      type: Array,
      required: false,
      default: undefined,
    },
  },
  setup(_props, { slots }) {
    return () => (slots.default ? slots.default() : null);
  },
});

export const app: AppModule = {
  shell: TodoShowcaseShell,
  loader(request) {
    return {
      requestPath: new URL(request.url).pathname,
      todoCount: listTodos().length,
    };
  },
};

export const routes: PageRouteRecord[] = [
  {
    id: "root",
    path: "/",
    module: {
      layout: TodoRouteLayout,
    },
    children: [
      {
        id: "home",
        path: "",
        module: {
          component: TodoHomePage,
          loader() {
            const todos = listTodos();
            const completed = todos.filter((todo) => todo.done).length;

            return {
              todos,
              summary: {
                total: todos.length,
                completed,
                remaining: todos.length - completed,
              },
            };
          },
          action({ formData }) {
            const intent = String(formData.get("intent") ?? "");

            if (intent === "create") {
              const title = String(formData.get("title") ?? "").trim();

              if (title) {
                createTodo({
                  title,
                  description: String(formData.get("description") ?? "").trim(),
                  priority: normalizePriority(formData.get("priority")),
                });
              }
            }

            if (intent === "toggle") {
              const id = String(formData.get("id") ?? "");
              const existing = listTodos().find((todo) => todo.id === id);

              if (existing) {
                updateTodo(id, {
                  done: !existing.done,
                });
              }
            }

            if (intent === "clear-completed") {
              clearCompletedTodos();
            }

            return {
              intent,
            };
          },
        },
        children: [],
      },
      {
        id: "task-detail",
        path: "tasks/:id",
        module: {
          component: TodoDetailPage,
          loader({ request }) {
            const url = new URL(request.url);
            const id = url.pathname.split("/").pop() ?? "";

            return {
              todo: getTodo(id),
            };
          },
          action({ formData }) {
            const intent = String(formData.get("intent") ?? "");
            const id = String(formData.get("id") ?? "");

            if (intent === "update") {
              const title = String(formData.get("title") ?? "").trim();

              if (title) {
                updateTodo(id, {
                  title,
                  description: String(formData.get("description") ?? "").trim(),
                });
              }
            }

            if (intent === "delete") {
              deleteTodo(id);
            }

            return {
              intent,
            };
          },
        },
        children: [],
      },
      {
        id: "head",
        path: "head",
        module: {
          component: TodoHeadPage,
        },
        children: [],
      },
      ...showcaseSections.filter((section) => section.id !== "home" && section.id !== "head").map((section) => ({
        id: section.id,
        path: section.path.slice(1),
        module: {
          component: TodoShowcasePage,
          loader() {
            return {
              section,
            };
          },
          props(loaderData: unknown) {
            return {
              section: (loaderData as { section: ShowcaseSection }).section,
            };
          },
        },
        children: [],
      })),
    ],
  },
];

function normalizePriority(value: FormDataEntryValue | null): "low" | "medium" | "high" {
  return value === "low" || value === "high" ? value : "medium";
}
