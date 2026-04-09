# vuepagelet Design

## Goal

`vuepagelet` is a route-level runtime built on top of native `vue` and `vue-router`.

It does not try to replace the router. The design goal is:

- keep URL matching, history, `RouterView`, and `RouterLink` on `vue-router`
- introduce an app-level document shell above the route tree
- add route-level `loader`, `action`, `deferred`, `middleware`, `layout`, `loading`, and `error`
- keep SSR, hydration, client navigation, and intercepted form submission on one consistent protocol

## Public Boundaries

There are only two public entrypoints:

- `vuepagelet`: usage-facing APIs for route modules and application code
- `vuepagelet/integration`: integration-facing APIs for hydration, SSR, request handling, and router wiring

### Usage Entry

The usage entry is for route modules and Vue components.

It exposes:

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

### Integration Entry

The integration entry is for upstream frameworks or bootstrapping code.

It exposes:

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
- transition manager helpers

The recommended high-level integration shape is a single runtime factory bound to `routes + app`:

```ts
const runtime = createRouteRuntimeIntegration({
  routes,
  app: {
    shell: AppShell,
    loader: async (request) => ({ pathname: new URL(request.url).pathname }),
    error: AppError,
    shouldRevalidate: (args) => args.type === "navigation",
  },
  clientEntryPath: "/examples/basic/client.ts",
});
```

## Internal Boundaries

Implementation stays in `src/lib` and is split into three domains:

- `dom/`
  - Vue components
  - composables
  - hydration
  - SSR rendering
- `router/`
  - route-record normalization
  - `vue-router` integration
  - navigation resolution
- `runtime/`
  - loader/action execution
  - deferred handling
  - middleware pipeline
  - runtime state
  - revalidation

This split is an implementation detail, not the main public API shape.

## Shared State Model

Alongside route runtime payload state, the runtime exposes an SSR-safe shared state store.

This model is closer to Nuxt's `useState()` than to route loader/action payloads:

- shared state is keyed
- shared state is request-scoped on the server
- shared state is serialized into the initial document payload
- hydration restores the same shared state on the client
- after hydration, client-side `useState()` calls reuse one app-level state store

This shared store is intentionally separate from route runtime payload state:

- `useState()` is for app-level shared refs
- `useAppData()` is for app-loader payload
- `useLoaderData()` / `useActionData()` remain route-runtime payload readers

This keeps SSR-safe shared state explicit without overloading loader/action payload state.

## App Model

Above the route tree, the runtime should support an app-level document model.

This app layer owns:

- `app shell`
- `app loader`
- `app error`
- `app shouldRevalidate`

### App Shell

The app shell is a document shell.

It is not just another route layout or a wrapper around the current route subtree.
It is responsible for rendering the full document shape:

- `<html>`
- `<head>`
- `<body>`

The route runtime is rendered inside that shell.

### App Loader

The app loader is request-level or document-level data.

It is meant for data that belongs to the whole application document rather than a specific matched route, for example:

- document theme
- locale
- app-wide session summary
- shell-level navigation data

This is distinct from route loader data and should not be modeled as just another root route loader.

### App Error

The app error boundary is above the route tree.

It handles failures that should replace or recover the whole application document shell, including:

- app loader failures
- app shell render failures
- route-runtime failures that escape route-level boundaries

Route-level `error` remains responsible for route subtree failures.
App-level `error` is the final document-level boundary.

### App Revalidation

`app.shouldRevalidate` controls whether `app.loader` should run again during intercepted navigation or action revalidation.

Default behavior:

- document requests always run `app.loader`
- intercepted navigation revalidates app data when pathname or search changes
- intercepted action revalidation does not re-run `app.loader` by default

This keeps document-level data explicit without turning every client interaction into a global app-data reload.

## Route Module Model

Each route record has a stable `id`, an optional `path`, a `module`, and `children`.

The route module supports:

- `component`
- `layout`
- `loading`
- `error`
- `loader`
- `action`
- `middleware`
- `shouldRevalidate`

### Page Route

A page route is a route that can render content and may handle actions.

Typical fields:

- `component`
- optional `loader`
- optional `action`
- optional `layout / loading / error / middleware / shouldRevalidate`

### Group Route

A group route is a route boundary node for a subtree.

It may be pathful or pathless.

It supports:

- `loader`
- `layout`
- `loading`
- `error`
- `middleware`
- `shouldRevalidate`

It does not support:

- `action`
- route-local page content as the primary leaf view

Group routes still participate in matching and have their own `routeId`, so they can own:

- loader data
- middleware
- revalidation rules
- layout boundaries
- loading boundaries
- error boundaries

## Rendering Model

Rendering has two layers:

- app-level document rendering
- route-level subtree rendering

Route rendering flows through `RouterView`.

- SSR creates a memory router
- hydration installs a real client router
- client navigation updates `RouterView` without a full page refresh

The route runtime is rendered inside the app shell.

The intended shape is:

- `appShell(appError | routeRuntimeTree)`

For each matched route, the runtime chooses a subject in this order:

1. `error`
2. `loading`
3. `component`

If the route declares `layout`, the final shape becomes:

- `layout(error | loading | component)`

This means layout is a stable route shell, not a separate router primitive.

## Hydration Model

The runtime has two client boot paths:

- element-root hydration when there is no app shell
- document-root takeover when `app.shell` exists

That means:

- SSR always returns a full document shell when `app.shell` exists
- client startup restores app data, route data, deferred state, and shared state from one runtime payload
- when `app.shell` exists, the client does not try to hydrate a nested root inside the document shell
- instead, it mounts against a document-root container and takes over the existing document shape

This keeps the app shell model intact while avoiding fragile partial hydration around `<html>`, `<head>`, and `<body>`.

Head state is then synchronized separately through the head manager after mount.

## Head Model

The document head model is explicit runtime state.

- `useHead()` is the base API
- `useTitle()`, `useMeta()`, `useLink()`, `useStyle()`, `useScript()`, and `updateHead()` are thin helpers on top
- SSR injects managed head entries into the outgoing HTML
- the client head manager reconnects after mount and keeps the live document in sync
- title updates are done in place by updating `document.title` and the active `<title>` node instead of replacing the node each time

## Error Model

Error handling follows nearest-boundary semantics.

There are two boundary layers:

- app-level error boundary
- route-level error boundaries

The current route or nearest ancestor route with `error` handles:

- loader failures
- action failures
- component render failures
- loading render failures
- deferred failures

If the route's own `layout` throws, that error is not handled by the same route's `error`.
It bubbles to the nearest ancestor route boundary instead.

This keeps layout failure handling consistent with the idea that layout wraps the route subject.

If no route-level boundary can handle a failure, the error bubbles to app-level `error`.

## Loading Model

`loading` is a route-level fallback tied to route data execution.

It is not a replacement for `useNavigation()`.

It is used when:

- a route has pending deferred work during SSR
- a client navigation or revalidation marks a route as pending
- old route data should not be treated as immediately renderable for that route subtree

`useNavigation()` remains the generic interaction-state API:

- `idle`
- `navigating`
- `loading`
- `submitting`

`loading` is the route subtree fallback.
`useNavigation()` is the interaction state surface.

## Data Model

Internal runtime transport is not limited to plain `JSON.stringify`.

The runtime uses `devalue` for its internal payload protocol so that SSR bootstrap state, deferred patches, intercepted navigation payloads, and intercepted action payloads can preserve richer built-in values across server and client.

Supported transport-friendly values include:

- `Date`
- `Map`
- `Set`
- `URL`
- normalized `Error` payloads

This should be treated as a framework-internal protocol layer, similar to how other meta-frameworks distinguish internal SSR payloads from plain external JSON APIs.

Data also has two scopes:

- app-level document data
- route-level matched data

App-level data comes from `app loader`.
Route-level data comes from matched route `loader`s.

### Loader

`loader` runs on matched routes and provides route data.

It may return:

- plain critical data
- `defer(critical, deferred)`
- a `Response`

`useLoaderData()` reads the current route loader data.
`useRouteLoaderData(routeId)` reads another route's loader data, typically a parent or ancestor layout route.

### Deferred

Deferred data is split into:

- critical data, available immediately
- deferred keys, resolved later

SSR and intercepted client navigation both use chunked streaming for deferred values.

For HTML document responses:

- the server renders the HTML shell with critical data
- deferred values are flushed later as `<script>` patches

For intercepted JSON navigation:

- the server first sends a navigation envelope
- deferred chunks follow as NDJSON stream entries

Action responses are intentionally different:

- action requests return JSON
- if action-triggered revalidation touches deferred loaders, the server resolves those deferred values before final JSON payload assembly

This keeps action consumption simple on the client.

## Action Model

Action execution is route-match driven.

For non-`GET` and non-`HEAD` requests:

1. match the request URL
2. walk matched routes from leaf to root
3. execute the nearest route `action`

There is no separate manual action id resolution model.

Intercepted action submissions use standard HTTP semantics:

- method identifies action requests
- `Accept: application/json` identifies that the client expects an action payload instead of a full HTML document

Non-intercepted action submissions still receive document responses.

## Navigation Model

Client navigation stays on `vue-router`.

The runtime augments navigation with route data fetching:

1. `vue-router` updates location and matched records
2. runtime computes a revalidation plan
3. the client requests route data with `Accept: application/json`
4. runtime merges returned loader data, deferred data, route errors, and pending keys into state

The browser does not perform a full document navigation for same-origin runtime-managed transitions.

## Revalidation Model

Revalidation decides which matched loaders must run again.

Default behavior is intentionally narrower than "rerun everything".

### Navigation Revalidation

On navigation:

- first load reruns all matched loaders
- entering a different matched branch reruns loaders from the divergence point downward
- when the branch stays the same and only params or query change, the default is to rerun the leaf loader

### Action Revalidation

After an action:

- the default is to rerun the action route loader if it exists
- parent or ancestor loaders may opt in through `shouldRevalidate`

### `shouldRevalidate`

Routes may override the default through `shouldRevalidate(args)`.

The arguments are a discriminated union:

- navigation revalidation args
- action revalidation args

Action args include metadata such as:

- `formMethod`
- `formAction`
- `actionStatus`
- `actionRouteId`
- `actionResult`

This lets layout or ancestor routes decide whether to rerun after a mutation.

## Middleware Model

Middleware does not live in `vue-router` guards.

That is deliberate:

- guards only cover client navigation
- SSR render also needs the same middleware semantics
- direct action requests also need the same middleware semantics

So middleware runs in a shared runtime pipeline and is reused across:

- render
- action

## Request Protocol

The protocol relies on standard HTTP meaning instead of custom headers.

### Document Request

Requests expecting HTML receive document responses:

- `GET/HEAD` with default browser `Accept`
- non-intercepted form submissions

### Navigation Data Request

Intercepted navigation uses:

- `GET/HEAD`
- `Accept: application/json`

The response is either:

- JSON when there is no deferred work
- NDJSON stream when there is deferred work

### Action Data Request

Intercepted action submission uses:

- non-`GET/HEAD`
- `Accept: application/json`

The response is JSON.

## Hydration Model

SSR bootstrap injects a runtime payload containing:

- loader data
- action data
- pending deferred keys
- route errors

The browser keeps two views of runtime state:

- a hydration snapshot used to match the server-rendered HTML
- the live runtime state used after mount

This avoids hydration mismatches when deferred patches arrive very early.

## Example

See the basic example:

- [examples/basic/README.md](./examples/basic/README.md)

Run it with:

```bash
pnpm example:basic
```
