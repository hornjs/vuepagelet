import { defineComponent, h, ref } from "vue";
import type {
  AppModule,
  NavigationState,
  PageRouteRecord,
} from "vuepagelet/integration";
import {
  defer,
  RouterLink,
  useActionData,
  useAppData,
  useCurrentPageRoute,
  useDeferredData,
  useDeferredError,
  useFetcher,
  useFormAction,
  useLoaderData,
  useNavigation,
  useRouteLoaderData,
  useRoute,
  useSubmit,
} from "vuepagelet";

export const AppShell = defineComponent({
  name: "ExampleAppShell",
  setup(_props, { slots }) {
    const appData = useAppData<{
      theme: string;
      requestPath: string;
      loadedAt: string;
    }>();

    return () =>
      h("html", { lang: "en", "data-allow-mismatch": "children" }, [
        h("head", { "data-allow-mismatch": "children" }, [
          h("meta", { charset: "utf-8" }),
          h("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1.0",
          }),
          h("title", "vuepagelet example"),
          h("style", styleSheet),
        ]),
        h("body", { style: shellStyle, "data-allow-mismatch": "children" }, [
          h("header", { style: headerStyle }, [
            h("h1", { style: titleStyle }, "vuepagelet example"),
            h(
              "p",
              { style: subtitleStyle },
              "document shell, route boundaries, deferred chunks, intercepted actions",
            ),
            h(
              "div",
              { style: badgeStyle },
              `app loader: ${appData.value?.theme ?? "unknown"} / ${appData.value?.requestPath ?? "/"} / ${appData.value?.loadedAt ?? "unknown"}`,
            ),
          ]),
          h("main", { style: mainStyle }, slots.default ? slots.default() : []),
        ]),
      ]);
  },
});

const AppError = defineComponent({
  name: "ExampleAppError",
  props: {
    error: {
      type: null,
      default: null,
    },
  },
  setup(props) {
    return () =>
      h("section", { style: cardStyle }, [
        h("div", { style: errorBadgeStyle }, "app error"),
        h("h2", { style: sectionTitleStyle }, "App boundary caught an error"),
        h("pre", { style: errorStyle }, formatRouteError(props.error)),
      ]);
  },
});

export const app: AppModule = {
  shell: AppShell,
  async loader(request) {
    const url = new URL(request.url);

    return {
      theme: "document-shell",
      requestPath: url.pathname,
      loadedAt: new Date().toISOString(),
    };
  },
  error: AppError,
  shouldRevalidate(args) {
    if (args.type === "action") {
      return Boolean(
        args.actionResult &&
        typeof args.actionResult === "object" &&
        "refreshApp" in args.actionResult &&
        args.actionResult.refreshApp === true,
      );
    }

    return args.defaultShouldRevalidate;
  },
};

const RootLayout = defineComponent({
  name: "RootLayout",
  setup(_props, { slots }) {
    return () =>
      h("div", [
        h("nav", { style: navStyle }, [
          h(RouterLink, { to: "/", exactActiveClass: "active-link" }, () => "Home"),
          h("span", { style: navDotStyle }, "•"),
          h(RouterLink, { to: "/posts/hello", activeClass: "active-link" }, () => "Post demo"),
        ]),
        slots.default ? slots.default() : null,
      ]);
  },
});

const HomePage = defineComponent({
  name: "HomePage",
  setup() {
    return () =>
      h("section", { style: cardStyle }, [
        h("h2", { style: sectionTitleStyle }, "Home"),
        h(
          "p",
          { style: paragraphStyle },
          "Open the posts demo to see group route layout/error, leaf route loading, deferred chunks, and intercepted actions.",
        ),
        h("div", { style: linkRowStyle }, [
          h(RouterLink, { to: "/posts/hello" }, () => "Open /posts/hello"),
          h(RouterLink, { to: "/posts/world" }, () => "Open /posts/world"),
          h(RouterLink, { to: "/posts/loader-fail" }, () => "Open /posts/loader-fail"),
          h(RouterLink, { to: "/posts/render-fail" }, () => "Open /posts/render-fail"),
        ]),
      ]);
  },
});

const PostLayout = defineComponent({
  name: "PostLayout",
  setup(_props, { slots }) {
    return () =>
      h("section", { style: cardStyle }, [
        h("div", { style: badgeStyle }, "posts layout"),
        slots.default ? slots.default() : null,
      ]);
  },
});

const PostLoadingState = defineComponent({
  name: "PostLoadingState",
  setup() {
    return () =>
      h("div", [
        h("div", { style: loadingBadgeStyle }, "route loading"),
        h("h2", { style: sectionTitleStyle }, "Loading post route"),
        h(
          "p",
          { style: paragraphStyle },
          "This route defines a route-level loading component. It is shown while deferred loader data is still pending.",
        ),
      ]);
  },
});

const PostsRouteError = defineComponent({
  name: "PostsRouteError",
  props: {
    error: {
      type: null,
      default: null,
    },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { style: errorBadgeStyle }, "route error boundary"),
        h("h2", { style: sectionTitleStyle }, "Posts boundary caught an error"),
        h(
          "p",
          { style: paragraphStyle },
          "This error UI comes from the posts group route. It wraps child route failures with the posts layout.",
        ),
        h("pre", { style: errorStyle }, formatRouteError(props.error)),
        h("div", { style: linkRowStyle }, [
          h(RouterLink, { to: "/posts/hello" }, () => "Recover to /posts/hello"),
          h(RouterLink, { to: "/posts/loader-fail" }, () => "Trigger loader error"),
          h(RouterLink, { to: "/posts/render-fail" }, () => "Trigger render error"),
          h(RouterLink, { to: "/posts/fail" }, () => "Trigger deferred error"),
        ]),
      ]);
  },
});

const PostPage = defineComponent({
  name: "PostPage",
  setup() {
    const route = useRoute();
    const pageRoute = useCurrentPageRoute();
    const loaderData = useLoaderData();
    const layoutLoaderData = useRouteLoaderData<{
      section: string;
      totalPosts: number;
      loadedAt: string;
    }>("posts");
    const deferredData = useDeferredData("slowBlock");
    const deferredError = useDeferredError("slowBlock");
    const actionData = useActionData();
    const appData = useAppData<{
      theme: string;
      requestPath: string;
      loadedAt: string;
    }>();
    const formAction = useFormAction();
    const fetcher = useFetcher();
    const submit = useSubmit();
    const navigation = useNavigation();
    const quickComment = ref("quick submit");

    async function handleFetcherSubmit(event: SubmitEvent) {
      event.preventDefault();
      const target = event.currentTarget as HTMLFormElement | null;
      if (!target) {
        return;
      }

      await fetcher.submit(target, {
        action: formAction.value,
        method: "post",
      });
    }

    async function handleQuickSubmit() {
      await submit(
        {
          comment: quickComment.value,
          mode: "button",
        },
        {
          action: formAction.value,
          method: "post",
        },
      );
    }

    async function handleAppRefreshSubmit() {
      await submit(
        {
          comment: quickComment.value,
          mode: "refresh-app",
        },
        {
          action: formAction.value,
          method: "post",
        },
      );
    }

    return () =>
      h("article", [
        route.value.params.slug === "render-fail"
          ? (() => {
              throw new Error("Post component failed during render.");
            })()
          : null,
        h(
          "h2",
          { style: sectionTitleStyle },
          `Post: ${route.value.params.slug} (${pageRoute?.id ?? "unknown"})`,
        ),
        h("p", { style: paragraphStyle }, [
          "Critical loader data is rendered immediately. Deferred data arrives later. ",
          "This leaf route defines a route-level loading state, while the parent posts group defines layout and error boundaries. ",
          "Form submit is intercepted with ",
          h("code", "useFetcher"),
          " / ",
          h("code", "useSubmit"),
          " and does not refresh the page.",
        ]),
        h("div", { style: linkRowStyle }, [
          h(RouterLink, { to: "/posts/hello", exactActiveClass: "active-link" }, () => "hello"),
          h(RouterLink, { to: "/posts/world", exactActiveClass: "active-link" }, () => "world"),
          h(
            RouterLink,
            { to: "/posts/loader-fail", exactActiveClass: "active-link" },
            () => "loader-fail",
          ),
          h(RouterLink, { to: "/posts/fail", exactActiveClass: "active-link" }, () => "fail"),
          h(
            RouterLink,
            { to: "/posts/render-fail", exactActiveClass: "active-link" },
            () => "render-fail",
          ),
          h(
            "span",
            { style: statusBadgeStyle(navigation.state.value) },
            `navigation: ${navigation.state.value}`,
          ),
        ]),
        h("pre", { style: preStyle }, JSON.stringify(loaderData.value, null, 2)),
        h(
          "pre",
          { style: infoStyle },
          `Parent loaderData (posts):\n${JSON.stringify(layoutLoaderData.value, null, 2)}`,
        ),
        h(
          "pre",
          { style: infoStyle },
          `Deferred slowBlock:\n${JSON.stringify(deferredData.value, null, 2)}`,
        ),
        deferredError.value
          ? h(
              "pre",
              { style: errorStyle },
              `Deferred error:\n${JSON.stringify(deferredError.value, null, 2)}`,
            )
          : null,
        actionData.value
          ? h(
              "pre",
              {
                style: isRejectedActionData(actionData.value) ? errorStyle : successStyle,
              },
              `Route actionData:\n${JSON.stringify(actionData.value, null, 2)}`,
            )
          : null,
        fetcher.data.value
          ? h(
              "pre",
              { style: successAltStyle },
              `Fetcher data:\n${JSON.stringify(fetcher.data.value, null, 2)}`,
            )
          : null,
        h("pre", { style: infoStyle }, `App data:\n${JSON.stringify(appData.value, null, 2)}`),
        h(
          "pre",
          { style: infoStyle },
          `Navigation state:\n${JSON.stringify(
            {
              state: navigation.state.value,
              location: navigation.location.value,
              action: navigation.action.value,
            },
            null,
            2,
          )}`,
        ),
        h(
          "form",
          {
            method: "post",
            action: formAction.value,
            style: formStyle,
            onSubmit: handleFetcherSubmit,
          },
          [
            h("label", { style: labelStyle, for: "comment" }, "Comment via useFetcher"),
            h("input", {
              id: "comment",
              name: "comment",
              value: "hello from fetcher",
              style: inputStyle,
            }),
            h(
              "button",
              {
                type: "submit",
                style: buttonStyle,
                disabled: fetcher.state.value === "submitting",
              },
              fetcher.state.value === "submitting" ? "Submitting..." : "Submit with useFetcher",
            ),
          ],
        ),
        h("div", { style: inlineActionStyle }, [
          h("input", {
            value: quickComment.value,
            onInput: (event: Event) => {
              quickComment.value = (event.target as HTMLInputElement | null)?.value ?? "";
            },
            style: inputStyle,
          }),
          h(
            "button",
            {
              type: "button",
              style: secondaryButtonStyle,
              onClick: handleQuickSubmit,
            },
            "Submit with useSubmit",
          ),
        ]),
        h("div", { style: inlineActionStyle }, [
          h(
            "p",
            { style: hintStyle },
            "Normal action does not revalidate app loader. Use the button below to explicitly request app loader refresh through app.shouldRevalidate.",
          ),
          h(
            "button",
            {
              type: "button",
              style: secondaryButtonStyle,
              onClick: handleAppRefreshSubmit,
            },
            "Submit and refresh app loader",
          ),
        ]),
        h(
          "p",
          { style: hintStyle },
          "Open `/posts/loader-fail`, `/posts/fail`, or `/posts/render-fail` to see loader, deferred, and render errors flow into the posts route error boundary. Submit a comment containing `fail` to see a validation-style action result, or `explode` to throw a real action error. In the browser, submits are intercepted and stay on the same page. Navigation refreshes app loader data by default, while action only refreshes it when app.shouldRevalidate opts in.",
        ),
      ]);
  },
});

export const routes: PageRouteRecord[] = [
  {
    id: "root",
    path: "/",
    module: {
      layout: RootLayout,
    },
    children: [
      {
        id: "home",
        path: "",
        module: {
          component: HomePage,
        },
        children: [],
      },
      {
        id: "posts",
        path: "posts",
        module: {
          layout: PostLayout,
          error: PostsRouteError,
          loader: async ({ params }) => ({
            section: "posts",
            totalPosts: 3,
            currentSlug: params.slug ?? null,
            loadedAt: new Date().toISOString(),
          }),
          shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
            defaultShouldRevalidate || currentUrl?.pathname !== nextUrl.pathname,
          middleware: [
            async (context, next) => {
              console.log(
                `[middleware:${context.phase}] ${context.request.method} ${context.request.url}`,
              );
              return next();
            },
          ],
        },
        children: [
          {
            id: "post-detail",
            path: ":slug",
            module: {
              component: PostPage,
              loading: PostLoadingState,
              loader: async ({ params }) => {
                if (params.slug === "loader-fail") {
                  throw new Error("Post loader failed before rendering.");
                }

                return defer(
                  {
                    slug: params.slug,
                    title: `Post ${params.slug}`,
                    renderedAt: new Date().toISOString(),
                  },
                  {
                    slowBlock: wait(600).then(() => {
                      if (params.slug === "fail") {
                        throw new Error("Deferred block failed for this route");
                      }

                      return {
                        streamedAt: new Date().toISOString(),
                        note: "This payload arrived after the HTML shell.",
                      };
                    }),
                  },
                );
              },
              action: async ({ params, formData }) => {
                const comment = String(formData.get("comment") ?? "");

                if (comment.toLowerCase().includes("explode")) {
                  throw new Error("Action exploded for this route.");
                }

                if (comment.toLowerCase().includes("fail")) {
                  return {
                    slug: params.slug,
                    accepted: false,
                    error: "Comment contains the reserved word 'fail'.",
                    comment,
                    processedAt: new Date().toISOString(),
                  };
                }

                return {
                  slug: params.slug,
                  accepted: true,
                  comment,
                  mode: formData.get("mode") ?? "form",
                  refreshApp: formData.get("mode") === "refresh-app",
                  processedAt: new Date().toISOString(),
                };
              },
            },
            children: [],
          },
        ],
      },
    ],
  },
];

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const shellStyle =
  "min-height:100vh;padding:40px;background:linear-gradient(180deg,#f7f1e7 0%,#f2f7ff 100%);font-family:Georgia,serif;color:#18212f;";
const headerStyle = "max-width:840px;margin:0 auto 24px;";
const titleStyle = "margin:0;font-size:40px;line-height:1;";
const subtitleStyle = "margin:10px 0 0;color:#4c5b70;";
const mainStyle = "max-width:840px;margin:0 auto;";
const navStyle = "display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 4px;";
const navDotStyle = "color:#94a3b8;";
const cardStyle =
  "background:rgba(255,255,255,0.84);border:1px solid rgba(24,33,47,0.1);border-radius:24px;padding:24px;box-shadow:0 16px 50px rgba(24,33,47,0.08);";
const badgeStyle =
  "display:inline-block;margin-bottom:12px;padding:6px 10px;border-radius:999px;background:#18212f;color:#fff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;";
const loadingBadgeStyle =
  "display:inline-block;margin-bottom:12px;padding:6px 10px;border-radius:999px;background:#0f3d66;color:#e0f2fe;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;";
const errorBadgeStyle =
  "display:inline-block;margin-bottom:12px;padding:6px 10px;border-radius:999px;background:#7f1d1d;color:#fee2e2;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;";
const sectionTitleStyle = "margin:0 0 12px;font-size:28px;";
const paragraphStyle = "margin:0 0 16px;line-height:1.7;color:#334155;";
// const linkStyle = "color:#b45309;font-weight:700;text-decoration:none;";
const linkRowStyle = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0 16px;";
const preStyle =
  "margin:0 0 16px;padding:16px;border-radius:16px;background:#18212f;color:#f8fafc;overflow:auto;";
const infoStyle =
  "margin:0 0 16px;padding:16px;border-radius:16px;background:#0f3d66;color:#e0f2fe;overflow:auto;";
const successStyle =
  "margin:0 0 16px;padding:16px;border-radius:16px;background:#14532d;color:#ecfdf5;overflow:auto;";
const successAltStyle =
  "margin:0 0 16px;padding:16px;border-radius:16px;background:#78350f;color:#fff7ed;overflow:auto;";
const errorStyle =
  "margin:0 0 16px;padding:16px;border-radius:16px;background:#7f1d1d;color:#fee2e2;overflow:auto;";
const formStyle = "display:grid;gap:10px;max-width:420px;margin:16px 0;";
const inlineActionStyle =
  "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;max-width:520px;";
const labelStyle = "font-weight:700;";
const inputStyle =
  "border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;background:#fff;color:#0f172a;";
const buttonStyle =
  "appearance:none;border:0;border-radius:12px;padding:12px 16px;background:#b45309;color:#fff;font-weight:700;cursor:pointer;";
const secondaryButtonStyle =
  "appearance:none;border:0;border-radius:12px;padding:12px 16px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer;";
const hintStyle = "margin:12px 0 0;font-size:14px;line-height:1.6;color:#64748b;";
const styleSheet = `
  a { color:#b45309; font-weight:700; text-decoration:none; }
  a:hover { text-decoration:underline; }
  .active-link {
    color:#fff !important;
    background:#18212f;
    border-radius:999px;
    padding:6px 10px;
    text-decoration:none;
  }
`;

function statusBadgeStyle(state: NavigationState) {
  const palette =
    state === "submitting"
      ? ["#7c2d12", "#ffedd5"]
      : state === "loading" || state === "navigating"
        ? ["#0f3d66", "#e0f2fe"]
        : ["#14532d", "#ecfdf5"];

  return `display:inline-block;padding:6px 10px;border-radius:999px;background:${palette[0]};color:${palette[1]};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;`;
}

function isRejectedActionData(value: unknown): value is { accepted: false } {
  return (
    typeof value === "object" && value !== null && "accepted" in value && value.accepted === false
  );
}

function formatRouteError(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify(
      {
        name: value.name,
        message: value.message,
        stack: value.stack,
      },
      null,
      2,
    );
  }

  if (typeof value === "object" && value !== null) {
    const record = value as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
    };

    if (
      typeof record.message === "string" ||
      typeof record.name === "string" ||
      typeof record.stack === "string"
    ) {
      return JSON.stringify(
        {
          name: record.name,
          message: record.message,
          stack: record.stack,
        },
        null,
        2,
      );
    }
  }

  return JSON.stringify(value, null, 2) ?? String(value);
}
