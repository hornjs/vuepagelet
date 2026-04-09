export interface TodoItem {
  id: string;
  title: string;
  description: string;
  done: boolean;
  priority: "low" | "medium" | "high";
  createdAt: string;
}

const todos = new Map<string, TodoItem>();
const seededTodos = [
  {
    title: "Ship showcase",
    description: "Land the home dashboard interactions without disturbing later routes.",
    priority: "high",
  },
  {
    title: "Draft roadmap",
    description: "Outline which showcase routes will light up after the home flow lands.",
    priority: "medium",
  },
  {
    title: "Record shell notes",
    description: "Keep the visual system stable while feature routes are still placeholders.",
    priority: "low",
  },
] satisfies Array<Pick<TodoItem, "title" | "description" | "priority">>;
let fallbackId = 0;

export function listTodos(): TodoItem[] {
  return Array.from(todos.values());
}

export function getTodo(id: string): TodoItem | null {
  return todos.get(id) ?? null;
}

export function createTodo(input: {
  title: string;
  description?: string;
  priority?: TodoItem["priority"];
}): TodoItem {
  const now = new Date().toISOString();
  const todo: TodoItem = {
    id: createTodoId(),
    title: input.title.trim(),
    description: input.description ?? "",
    done: false,
    priority: input.priority ?? "medium",
    createdAt: now,
  };

  todos.set(todo.id, todo);
  return todo;
}

export function updateTodo(
  id: string,
  input: Partial<Pick<TodoItem, "title" | "description" | "priority" | "done">>,
): TodoItem | null {
  const existing = todos.get(id);

  if (!existing) {
    return null;
  }

  const updated: TodoItem = {
    ...existing,
    ...input,
  };

  todos.set(id, updated);
  return updated;
}

export function deleteTodo(id: string): boolean {
  return todos.delete(id);
}

export function resetTodoStore(): void {
  todos.clear();
  fallbackId = 0;

  for (const todo of seededTodos) {
    createTodo(todo);
  }
}

export function clearCompletedTodos(): number {
  let cleared = 0;

  for (const todo of listTodos()) {
    if (!todo.done) {
      continue;
    }

    if (deleteTodo(todo.id)) {
      cleared += 1;
    }
  }

  return cleared;
}

function createTodoId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  fallbackId += 1;
  return `todo-${fallbackId}`;
}

resetTodoStore();
