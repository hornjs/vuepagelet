import { getCurrentInstance, inject, provide, shallowRef, type InjectionKey, type Ref } from "vue";

export interface StateStore {
  readonly values: Map<string, Ref<unknown>>;
}

export const stateStoreKey: InjectionKey<StateStore> = Symbol("route-state-store");

let clientStateStore = createStateStore();

export function createStateStore(initialState: Record<string, unknown> = {}): StateStore {
  const values = new Map<string, Ref<unknown>>();

  for (const [key, value] of Object.entries(initialState)) {
    values.set(key, shallowRef(value));
  }

  return {
    values,
  };
}

export function provideStateStore(store: StateStore): void {
  provide(stateStoreKey, store);
}

export function initializeClientStateStore(initialState: Record<string, unknown> = {}): StateStore {
  clientStateStore = createStateStore(initialState);
  return clientStateStore;
}

export function serializeStateStore(store: StateStore): Record<string, unknown> {
  return Object.fromEntries(
    Array.from(store.values.entries()).map(([key, value]) => [key, value.value]),
  );
}

export function useState<T = unknown>(key: string, initialValue?: T | (() => T)): Ref<T> {
  const store = resolveStateStore();
  return getOrCreateState(store, key, initialValue);
}

function getOrCreateState<T = unknown>(
  store: StateStore,
  key: string,
  initialValue?: T | (() => T),
): Ref<T> {
  if (!store.values.has(key)) {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    store.values.set(key, shallowRef(value));
  }

  return store.values.get(key) as Ref<T>;
}

function resolveStateStore(): StateStore {
  const instance = getCurrentInstance();
  const injectedStore = instance ? inject(stateStoreKey, null) : null;

  if (injectedStore) {
    return injectedStore;
  }

  if (typeof window !== "undefined") {
    return clientStateStore;
  }

  throw new Error("useState() must be called during component setup on the server.");
}
