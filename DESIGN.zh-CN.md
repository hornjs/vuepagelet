# vuepagelet 设计说明

[English Design](DESIGN.md)

## 目标

`vuepagelet` 是一个构建在原生 `vue` 和 `vue-router` 之上的路由级运行时。

它不试图替代路由器，设计目标是：

- URL 匹配、history、`RouterView`、`RouterLink` 继续由 `vue-router` 负责
- 在路由树之上引入 app 级 document shell
- 在其之上补充路由级别的 `loader`、`action`、`deferred`、`middleware`、`layout`、`loading`、`error`
- 让 SSR、hydration、客户端导航和拦截式表单提交共享一套一致的协议

## 公开边界

对外只有两个入口：

- `vuepagelet`: 面向 route module 和页面代码的使用侧 API
- `vuepagelet/integration`: 面向框架接入、SSR、请求处理、hydration 和 router 接线的集成侧 API

### 使用侧入口

使用侧入口面向 route module 和 Vue 组件。

暴露：

- `RouterView`
- `RouterLink`
- `useAppData`
- `useAppError`
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

### 集成侧入口

集成侧入口面向上层框架和启动代码。

暴露：

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
- transition manager 相关辅助函数

推荐的高层集成形态是一个绑定了 `routes + app` 的 runtime factory：

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

## 内部边界

实现保留在 `src/lib`，并分成三层：

- `dom/`
  - Vue 组件
  - composable
  - hydration
  - SSR 渲染
- `router/`
  - route record 归一化
  - `vue-router` 集成
  - 导航解析
- `runtime/`
  - loader/action 执行
  - deferred 处理
  - middleware pipeline
  - runtime state
  - revalidation

这层拆分是实现细节，不是主要公开心智。

## 共享状态模型

除了 route runtime payload state，这个运行时还提供一层 SSR-safe 的共享状态 store。

这层模型更接近 Nuxt 的 `useState()`，而不是 route loader/action payload：

- 状态按 key 共享
- 服务端按请求隔离
- 共享状态会被序列化进首屏 document payload
- hydration 时恢复同一份 shared state
- hydration 之后，客户端的 `useState()` 会复用同一个 app 级 state store

这层 shared store 和 route runtime payload state 有意分开：

- `useState()` 适合应用级共享 `ref`
- `useAppData()` 读取 app loader payload
- `useLoaderData()` / `useActionData()` 继续读取 route runtime payload

这样可以把 SSR-safe shared state 单独建模，而不会把 loader/action payload 继续混成“通用状态管理”。

## App 模型

在路由树之上，运行时还应支持一层 app 级 document 模型。

这层 app 负责：

- `app shell`
- `app loader`
- `app error`
- `app shouldRevalidate`

### App Shell

`app shell` 是 document shell。

它不是另一个普通 route layout，也不是简单包一层 route subtree 的组件。
它负责输出完整文档结构：

- `<html>`
- `<head>`
- `<body>`

route runtime 渲染在这个 shell 内部。

### App Loader

`app loader` 提供 request 级或 document 级数据。

它适合承载属于整个应用文档、而不是某个 matched route 的数据，例如：

- 文档主题
- locale
- app 级 session 摘要
- shell 级导航数据

它和 route loader 是两层概念，不应只被视作“另一个 root route loader”。

### App Error

`app error` 是位于 route tree 之上的错误边界。

它负责处理那些应当替换或兜底整个应用文档壳子的错误，包括：

- app loader 失败
- app shell 渲染失败
- route runtime 中未被 route-level boundary 接住的错误

route 级 `error` 仍然只负责 route subtree 的失败；
app 级 `error` 是最终的 document-level boundary。

### App Revalidation

`app.shouldRevalidate` 用来控制在拦截式 navigation 或 action revalidation 期间，是否重新执行 `app.loader`。

默认规则是：

- document 请求总是执行 `app.loader`
- 拦截式 navigation 在 pathname 或 search 变化时重跑 app 数据
- 拦截式 action revalidation 默认不重跑 `app.loader`

这样可以让 document 级数据保持明确边界，而不会把每一次客户端交互都放大成全局 app 数据重载。

## Route Module 模型

每个 route record 都有稳定的 `id`、可选的 `path`、`module` 和 `children`。

route module 支持：

- `component`
- `layout`
- `loading`
- `error`
- `loader`
- `action`
- `middleware`
- `shouldRevalidate`

### 页面路由

页面路由可以渲染内容，也可以处理 action。

典型字段：

- `component`
- 可选 `loader`
- 可选 `action`
- 可选 `layout / loading / error / middleware / shouldRevalidate`

### 路由组

路由组是一个承载子树边界能力的节点。

它可以有 path，也可以是 pathless。

支持：

- `loader`
- `layout`
- `loading`
- `error`
- `middleware`
- `shouldRevalidate`

不支持：

- `action`
- 作为主要叶子页面内容的 route-local page content

路由组仍然参与匹配，并且拥有独立的 `routeId`，因此可以稳定承载：

- loader 数据
- middleware
- revalidation 规则
- layout boundary
- loading boundary
- error boundary

## 渲染模型

渲染应分成两层：

- app 级 document 渲染
- route 级 subtree 渲染

路由渲染通过 `RouterView` 完成。

- SSR 先创建 memory router
- hydration 安装真实 client router
- 客户端导航更新 `RouterView`，不做整页刷新

route runtime 渲染在 app shell 内部。

目标形态是：

- `appShell(appError | routeRuntimeTree)`

对每一个 matched route，运行时都会按下面顺序选择主体：

1. `error`
2. `loading`
3. `component`

如果这个 route 声明了 `layout`，最终渲染形态就是：

- `layout(error | loading | component)`

这意味着 `layout` 是稳定的 route shell，而不是另一套 router 原语。

## Hydration 模型

当存在 app shell 时，hydration 模型应当是 document-level hydration。

也就是说：

- SSR 返回完整 document shell
- hydration 从 document shell 恢复整个 app
- app shell 状态、app 数据、route 数据都属于同一份 hydration snapshot

运行时最终应从 document container 进行 hydration，而不是只从 document 内的某个 element root 进行 hydration。

这是必要的，因为一旦引入 `app shell`、`app loader`、`app error`，document shell 本身就是应用模型的一部分。

当前行为是：

- 如果存在 `app.shell`，从 document container 做 hydration
- 否则保留旧的 element-level root 兼容路径

这个兼容路径只是过渡方案，最终应在 app 级 document shell 成为唯一模型后移除。

## 错误模型

错误处理遵循“最近边界”规则。

错误边界分成两层：

- app 级 error boundary
- route 级 error boundary

当前 route 或最近祖先 route 上的 `error` 会处理：

- loader 失败
- action 失败
- component render 失败
- loading render 失败
- deferred 失败

如果 route 自己的 `layout` 抛错，这个错误不会由同一个 route 的 `error` 自己吃掉。
它会继续向上冒泡到最近祖先边界。

这和“layout 包裹 route subject”这条设计是一致的。

如果 route 级 boundary 都无法处理，错误会继续冒泡到 app 级 `error`。

## Loading 模型

## Payload 协议

内部 runtime transport 不再局限于普通 `JSON.stringify`。

运行时内部 payload 协议统一使用 `devalue`，这样 SSR bootstrap state、deferred patch、拦截式 navigation payload、拦截式 action payload 都可以在服务端和客户端之间保留 richer built-in values。

当前支持稳定传递的值包括：

- `Date`
- `Map`
- `Set`
- `URL`
- 经过规整的 `Error` payload

这应当被视作框架内部协议层，而不是面对外部 HTTP API 的通用 JSON 约束。也就是说，内部 SSR/runtime payload 可以 richer，而用户显式返回的外部 JSON `Response` 仍然保持普通 JSON 语义。

## Loading 模型

`loading` 是一个和 route 数据执行绑定的 route-level fallback。

它不是 `useNavigation()` 的替代。

使用场景：

- SSR 期间当前 route 存在 pending deferred
- 客户端导航或 revalidation 把当前 route 标记为 pending
- 当前 route subtree 不能直接拿旧数据立即渲染

`useNavigation()` 仍然负责通用交互状态：

- `idle`
- `navigating`
- `loading`
- `submitting`

一句话：

- `loading` 负责 route subtree fallback
- `useNavigation()` 负责交互状态表达

## 数据模型

数据也分成两层：

- app 级 document 数据
- route 级 matched 数据

app 级数据来自 `app loader`。
route 级数据来自 matched route 的 `loader`。

### Loader

`loader` 运行在 matched routes 上，并提供 route data。

它可以返回：

- 普通 critical 数据
- `defer(critical, deferred)`
- `Response`

`useLoaderData()` 读取当前 route 的 loader 数据。
`useRouteLoaderData(routeId)` 读取别的 route 的 loader 数据，通常是父级或更高层 layout route。

### Deferred

deferred 数据被拆成：

- 立即可用的 critical 数据
- 稍后 resolve 的 deferred keys

SSR 和拦截式客户端导航都使用 chunked streaming 传递 deferred 数据。

对于 HTML document 响应：

- 服务端先渲染 HTML shell 和 critical 数据
- deferred 数据之后以 `<script>` patch 的形式继续刷出

对于拦截式 JSON 导航：

- 服务端先发送一个 navigation envelope
- 后续的 deferred chunk 以 NDJSON 继续追加

action 响应故意不走这套流式协议：

- action 请求返回 JSON
- 如果 action 触发的 revalidation 命中了 deferred loader，服务端会先把这些 deferred resolve 完，再组装最终 JSON

这样客户端消费 action 响应会简单很多。

## Action 模型

action 执行是基于 route match 的。

对于非 `GET` / `HEAD` 请求：

1. 先匹配请求 URL
2. 沿 matched routes 从叶子向上查找
3. 执行最近的 route `action`

这里不再有单独的手工 action id 解析模型。

拦截式 action 提交依赖标准 HTTP 语义：

- method 区分 action 请求
- `Accept: application/json` 表示客户端期望拿到 action payload，而不是整页 HTML

非拦截式 action 提交仍然返回 document 响应。

## Navigation 模型

客户端导航继续交给 `vue-router`。

runtime 做的是在导航后补 route data：

1. `vue-router` 更新 location 和 matched records
2. runtime 计算这次的 revalidation plan
3. 客户端用 `Accept: application/json` 请求 route data
4. runtime 把返回的 loaderData、deferredData、routeErrors、pending keys 合并进 state

浏览器不会对同源 runtime-managed 导航执行整页 document 跳转。

## Revalidation 模型

revalidation 决定这次哪些 matched loaders 需要重新执行。

默认行为不是“全部重跑”，而是尽量收窄。

### 导航后的 revalidation

导航时：

- 首次加载：重跑所有 matched loaders
- 进入不同 matched 分支：从分歧点开始向下重跑
- 分支不变、只有 params 或 query 变化：默认只重跑 leaf loader

### Action 后的 revalidation

action 之后：

- 默认只重跑 action route 自己的 loader（如果它有）
- 父级或祖先 loader 是否重跑，由 `shouldRevalidate` 决定

### `shouldRevalidate`

route 可以通过 `shouldRevalidate(args)` 覆盖默认行为。

它的参数是一个判别联合：

- navigation revalidation args
- action revalidation args

action 分支会带这些元信息：

- `formMethod`
- `formAction`
- `actionStatus`
- `actionRouteId`
- `actionResult`

这样 layout route 或祖先 route 就能在 mutation 后精确决定要不要重跑。

## Middleware 模型

middleware 不放在 `vue-router` guard 上。

这是刻意的设计：

- guard 只覆盖客户端导航
- SSR render 也需要相同语义
- 直接 action 请求也需要相同语义

因此 middleware 运行在共享 runtime pipeline 里，并在这些阶段复用：

- render
- action

## 请求协议

协议尽量依赖标准 HTTP 语义，而不是自定义报头。

### Document Request

期望 HTML 的请求会拿到 document 响应：

- 默认浏览器 `Accept` 的 `GET/HEAD`
- 非拦截式 form 提交

### Navigation Data Request

拦截式导航使用：

- `GET/HEAD`
- `Accept: application/json`

响应可能是：

- 没有 deferred 时返回 JSON
- 有 deferred 时返回 NDJSON stream

### Action Data Request

拦截式 action 使用：

- 非 `GET/HEAD`
- `Accept: application/json`

响应固定为 JSON。

## Hydration 模型

SSR bootstrap 会注入一份 runtime payload，包含：

- loader data
- action data
- pending deferred keys
- route errors

浏览器里会同时保留两份视图：

- hydration snapshot
  - 用来和服务端 HTML 对齐
- live runtime state
  - mount 后继续驱动页面更新

这样可以避免 deferred patch 过早到达时造成 hydration mismatch。

## 示例

参考基础示例：

- [examples/basic/README.md](./examples/basic/README.md)

运行命令：

```bash
pnpm example:basic
```
