# Todo App Example

`examples/todo-app` is the full showcase example for `vuepagelet`.

Run:

```bash
pnpm example:todo-app
```

Open:

- `http://localhost:3210/`
- `http://localhost:3210/tasks/<id>`
- `http://localhost:3210/head`
- `http://localhost:3210/deferred`
- `http://localhost:3210/errors`
- `http://localhost:3210/debug`

What this example shows:

- one package-style example directory with `server.ts`, `client.ts`, `routes.ts`, `store.ts`, and `styles.ts`
- a shared app shell with document-level data from `app.loader`
- route-local loader and action flows on the home dashboard and task detail routes
- in-memory todo mutations without a full page reload
- route-driven document titles
- `useHead`, `useTitle`, `useMeta`, `useLink`, `useStyle`, `useScript`, and `updateHead` on `/head`
- a head manager that keeps `document.title` and managed head nodes in sync after mount
- `RouterLink`, `useSubmit`, and `useFormAction` in normal application flows

Current route breakdown:

- `/`
  home dashboard with seeded todos, create, toggle, and clear-completed actions
- `/tasks/:id`
  task detail editing, delete flow, and title derived from the task name
- `/head`
  managed head showcase with live client updates
- `/deferred`, `/errors`, `/debug`
  shell-backed placeholder routes reserved for the next showcase wave

This example uses an in-memory store on purpose:

- no persistence layer
- restarting the server resets the todos
- the goal is to showcase runtime behavior, not storage
