# vuepagelet

[Chinese README](./README.zh-CN.md)

`vuepagelet` is a Vue page runtime built on top of native `vue` and `vue-router` capabilities.

It does not try to replace the router. Instead:

- `vue-router` owns `RouterView`, `RouterLink`, history, and current route state
- `vuepagelet` adds app shell, loader/action/deferred data, middleware, SSR, hydration, and navigation state

## Status

This package is currently workspace-local and experimental.

## Public Surface

This package exposes two entrypoints:

- `vuepagelet`: usage-facing APIs for route modules and app code
- `vuepagelet/integration`: integration-facing APIs for SSR, request handling, hydration, and router wiring

### `vuepagelet`

- `ClientOnly`
- `DevOnly`
- `RouterView`
- `RouterLink`
- `useAppData`
- `useAppError`
- `useHead`
- `useTitle`
- `useMeta`
- `useLink`
- `useStyle`
- `useScript`
- `updateHead`
- `useRoute`
- `useRouter`
- `useCurrentPageRoute`
- `usePageRoute`
- `useLoaderData`
- `useRouteLoaderData`
- `useDeferredData`
- `useDeferredError`
- `useActionData`
- `useNavigation`
- `useState`
- `useFormAction`
- `useFetcher`
- `useSubmit`
- `defer`

### `vuepagelet/integration`

- `createRouteRuntimeIntegration`
- `hydratePage`
- `createPageRouter`
- `createRouteResolver`
- `createVuePageRouteRecords`
- `matchPageRoute`
- `resolveNavigationLocation`
- `loadRouteData`
- `executeMatchedAction`
- `renderPageResponse`
- `handlePageRequest`
- `runWithRouteMiddleware`
- transition manager helpers:
  `startNavigation`, `finishNavigation`, `startLoading`, `finishLoading`, `startSubmitting`, `finishSubmitting`

Typical integration shape:

```ts
import {
  createRouteRuntimeIntegration,
  type AppModule,
} from "vuepagelet/integration";

const app: AppModule = {
  shell: AppShell,
  loader: async (request) => ({ pathname: new URL(request.url).pathname }),
  error: AppError,
  shouldRevalidate: (args) => args.type === "navigation",
};

const runtime = createRouteRuntimeIntegration({
  routes,
  app,
  clientEntryPath: "/examples/basic/client.ts",
});

await runtime.handleRequest(request);
runtime.hydrate().mount();
```

## Naming

Follow `vue-router` naming by default:

- use `RouterView`, not `RouteView`
- use `RouterLink`, not `RouteLink`
- use `useRoute()` for route-view information
- use `useCurrentPageRoute()` / `usePageRoute()` for page-route record metadata

This keeps router semantics aligned with Vue Router while leaving page-runtime metadata explicit.

## Route Rendering

Route rendering should flow through `RouterView`.

- SSR creates a memory router before rendering
- hydration installs a real client router
- client navigation updates `RouterView` instead of relying on browser full-page reloads

Above the route tree, integration may provide an app-level document model through the integration `app` option:

- `app.shell`
- `app.loader`
- `app.error`
- `app.shouldRevalidate`

## Data Model

`loader` and `action` are still runtime concepts owned by this package.

- `loader` can return `defer(critical, deferred)`
- `app.loader` provides document-level data for the app shell
- `app.shouldRevalidate` controls whether app loader data should be refreshed during navigation or action revalidation
- deferred values are streamed into the page through chunked patches
- `action` defaults to intercepted submission via `useFetcher()` / `useSubmit()`
- middleware runs in the runtime pipeline and is shared by render/action phases

## Head And Visibility

The runtime includes document-head composables and small visibility helpers:

- `useHead()` is the low-level document API
- `useTitle()`, `useMeta()`, `useLink()`, `useStyle()`, `useScript()`, and `updateHead()` build on top of it
- SSR injects head entries into the rendered document
- the client runtime connects a head manager after mount and keeps `document.title`, `<title>`, and managed head nodes in sync
- `ClientOnly` renders fallback content on the server and swaps to client content after mount
- `DevOnly` only renders when the current build is running in development mode

## Shared State

The runtime also exposes a Nuxt-style `useState(key, initialValue?)` API for SSR-safe shared state.

- state is request-scoped on the server
- shared state is serialized into the initial document payload
- hydration restores the same keyed state on the client
- client-side `useState()` calls share one app-level store after hydration

This state store is separate from route runtime payload state:

- use `useState()` for application-level shared refs
- use `useAppData()` / `useLoaderData()` / `useActionData()` for request-driven runtime payloads

### Payload Serialization

Internal runtime payloads use `devalue`.

This applies to:

- SSR bootstrap payloads
- deferred patch scripts
- intercepted navigation payloads
- intercepted action payloads

This keeps richer built-in values stable across server and client, including:

- `Date`
- `Map`
- `Set`
- `URL`
- normalized `Error` payloads

User-facing plain HTTP APIs are still free to use regular JSON when returning explicit `Response` objects.

## Internal Boundaries

Internal implementation stays split inside `src/lib`:

- `dom/`: Vue component tree, composables, SSR response rendering
- `router/`: route records, `vue-router` integration, navigation resolution
- `runtime/`: deferred data, action execution, middleware pipeline, runtime state

Removed from the old experimental shape:

- no `app-routes/`
- no `server/`
- no standalone request handler abstraction

## Examples

Run the low-level runtime demo:

```bash
pnpm example:basic
```

Run the showcase todo app:

```bash
pnpm example:todo-app
```

See:

- [DESIGN.md](./DESIGN.md)
- [README.zh-CN.md](./README.zh-CN.md)
- [DESIGN.zh-CN.md](./DESIGN.zh-CN.md)
- [examples/basic/README.md](./examples/basic/README.md)
- [examples/todo-app/README.md](./examples/todo-app/README.md)
