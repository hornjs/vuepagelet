# Basic Example

`examples/basic` is the low-level runtime demo. It exists to show the smallest stable package-style surface for `vuepagelet`, not to host a full showcase app.

Run:

```bash
pnpm example:basic
```

Open:

- `http://localhost:3210/`
- `http://localhost:3210/posts/hello`

What this example shows:

- a single `routes.ts` file is shared by server render and browser hydration
- a single `app` module is shared by server render and browser hydration
- `group route`: the `posts` route is a real route group with `loader / layout / error / middleware`, but no `component` or `action`
- `router/`: route records are matched by `vue-router`
- `RouterView` / `RouterLink`: built on top of `vue-router` `RouterView` / `RouterLink`
- `runtime/`: middleware and action execution are driven by matched routes
- `dom/`: Vue SSR renders the route runtime inside an app shell
- `app`: document shell, app loader, and app error are configured once and reused on both server and client
- `app.shouldRevalidate`: app loader defaults to refresh on navigation, and only refreshes on action when explicitly opted in
- the document shell sets `data-allow-mismatch="children"` on `html/head/body`, because the runtime injects hydration payload and client scripts there
- browser modules are served by Vite middleware from source, so the demo stays on native `vue` / `vue-router` ESM instead of relying on the package's bundled browser output
- the server is started directly with Node's TypeScript mode via `node --experimental-strip-types`
- `deferred`: `loader` returns `defer(...)`, and the response flushes extra chunks later
- `useDeferredError`: deferred failures can be surfaced without tearing down the whole page
- `useFetcher` / `useSubmit`: form submit is intercepted with `preventDefault()`, action runs without a full page refresh
- `useFormAction`: action target is derived from the matched route by default
- `useCurrentPageRoute`: page-route record metadata stays separate from `useRoute()`
- `useAppData`: the app shell reads document-level data from `app.loader`
- the app shell shows `loadedAt`, so you can see when app loader did or did not re-run
- `useRouteLoaderData(routeId)`: child routes can read parent layout loader data explicitly by route id
- `shouldRevalidate`: routes can opt into re-running parent/layout loaders during client navigation
- `layout / loading / error`:
  - `root` uses `layout`
  - `posts` group route uses `layout + error`
  - `post-detail` leaf route uses `loading`

Feature showcases that need a fuller application shell should live in `examples/todo-app` instead of expanding this demo.

To inspect the streamed deferred payload directly:

```bash
curl -N http://localhost:3210/posts/hello
```

To trigger route-matched action handling:

```bash
curl -X POST http://localhost:3210/posts/hello \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'comment=hello'
```

In the browser demo:

- nav links use `RouterLink` with `activeClass` / `exactActiveClass`
- the form uses `useFetcher().submit(form, ...)`
- the button uses `useSubmit()`
- the post detail page reads the `posts` layout loader data via `useRouteLoaderData("posts")`
- navigating between post pages refreshes app loader data by default
- the regular action buttons do not refresh app loader data
- the "Submit and refresh app loader" button demonstrates `app.shouldRevalidate(...)` opting app loader back in for action revalidation
- the `posts` layout declares `shouldRevalidate(...)`, so navigating from `/posts/hello` to `/posts/world` also refreshes the parent layout loader data
- both stay on the same page and update local runtime state
- `/posts/loader-fail` demonstrates a loader error hitting the posts group error boundary
- `/posts/fail` demonstrates a deferred error hitting the posts group error boundary
- `/posts/render-fail` demonstrates a render error hitting the posts group error boundary
- submitting a comment containing `fail` demonstrates an action validation-style error payload
- submitting a comment containing `explode` demonstrates a thrown action error hitting the posts group error boundary
