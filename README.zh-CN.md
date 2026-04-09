# vuepagelet

[English README](README.md)

`vuepagelet` 是一个构建在原生 `vue` 和 `vue-router` 能力之上的路由运行时。

它不试图替代路由器，而是做清晰分层：

- `vue-router` 负责 `RouterView`、`RouterLink`、history 和当前路由状态
- `vuepagelet` 负责 app shell、loader/action/deferred 数据、middleware、SSR、hydration 和导航状态

## 状态

这个包目前仍处于工作区内部实验阶段。

## 公开边界

这个包只有两个公开入口：

- `vuepagelet`：面向路由模块和页面代码的使用侧 API
- `vuepagelet/integration`：面向 SSR、请求处理、hydration、router 接线的集成侧 API

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
- 过渡状态辅助函数：
  `startNavigation`、`finishNavigation`、`startLoading`、`finishLoading`、`startSubmitting`、`finishSubmitting`

典型接入形态：

```ts
import { createRouteRuntimeIntegration, type AppModule } from "vuepagelet/integration";

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

## 命名

默认遵循 `vue-router` 的命名：

- 使用 `RouterView`，而不是 `RouteView`
- 使用 `RouterLink`，而不是 `RouteLink`
- `useRoute()` 用于读取路由视图信息
- `useCurrentPageRoute()` / `usePageRoute()` 用于读取 page-route 元数据

这样可以保持路由语义和 Vue Router 一致，同时把 page runtime 的元信息单独表达出来。

## 路由渲染

路由渲染主路径应该通过 `RouterView` 完成。

- SSR 时先创建 memory router 再渲染
- hydration 时安装真实的 client router
- 客户端导航通过更新 `RouterView` 完成，而不是依赖浏览器整页刷新

在 route tree 之上，集成层现在可以通过 `app` 提供 app 级 document 模型：

- `app.shell`
- `app.loader`
- `app.error`
- `app.shouldRevalidate`

## 数据模型

`loader` 和 `action` 仍然是这个包拥有的 runtime 概念。

- `loader` 可以返回 `defer(critical, deferred)`
- `app.loader` 提供 document 级 app 数据，供 app shell 使用
- `app.shouldRevalidate` 控制在 navigation 或 action revalidation 期间是否刷新 app loader 数据
- deferred 数据会通过 chunked patch 流式进入页面
- `action` 默认通过 `useFetcher()` / `useSubmit()` 拦截式提交
- middleware 运行在共享的 runtime pipeline 里，并在 render/action 两个阶段复用

## Head 与可见性

运行时现在也包含 document head composable 和两个可见性辅助组件：

- `useHead()` 是底层 document API
- `useTitle()`、`useMeta()`、`useLink()`、`useStyle()`、`useScript()`、`updateHead()` 都建立在它之上
- SSR 会把 head 条目注入最终文档
- 客户端会在挂载后接管 head，同步 `document.title`、`<title>` 和其它受管 head 节点
- `ClientOnly` 在服务端渲染 fallback，挂载后切换到客户端内容
- `DevOnly` 只会在开发模式下渲染

## 共享状态

运行时还提供了一层类似 Nuxt 的 `useState(key, initialValue?)`，用于 SSR-safe 的共享状态。

- 服务端按请求隔离
- 共享状态会被序列化进首屏 document payload
- hydration 时会恢复同一份 keyed state
- hydration 之后，客户端的 `useState()` 会共享同一个 app 级 store

这层状态和 route runtime payload state 是分开的：

- `useState()` 适合应用级共享 `ref`
- `useAppData()` / `useLoaderData()` / `useActionData()` 仍然用于请求驱动的 runtime payload

### Payload 序列化

内部 runtime payload 统一使用 `devalue`。

这覆盖：

- SSR bootstrap payload
- deferred patch script
- 拦截式 navigation payload
- 拦截式 action payload

这样服务端和客户端之间可以稳定传递 richer built-in values，包括：

- `Date`
- `Map`
- `Set`
- `URL`
- 经过规整的 `Error` payload

而用户自己显式返回的普通 HTTP `Response` 仍然可以继续使用常规 JSON 语义。

## 内部边界

内部实现保留在 `src/lib` 里，并分成三层：

- `dom/`：Vue 组件树、composable、SSR 响应渲染
- `router/`：route record、`vue-router` 集成、导航解析
- `runtime/`：deferred 数据、action 执行、middleware pipeline、runtime state

从旧的实验形态里移除了这些概念：

- 没有 `app-routes/`
- 没有 `server/`
- 没有独立的 request handler abstraction

## 示例

运行低层 runtime demo：

```bash
pnpm example:basic
```

运行 showcase todo app：

```bash
pnpm example:todo-app
```

参考：

- [DESIGN.zh-CN.md](./DESIGN.zh-CN.md)
- [examples/basic/README.md](./examples/basic/README.md)
- [examples/todo-app/README.md](./examples/todo-app/README.md)
