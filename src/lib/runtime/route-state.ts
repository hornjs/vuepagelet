export interface RouteStateMaps {
  loaderData?: Record<string, unknown>;
  actionData?: Record<string, unknown>;
  deferredData?: Record<string, Record<string, unknown>>;
  deferredErrors?: Record<string, Record<string, unknown>>;
  pendingDeferredKeys?: Record<string, string[]>;
  routeErrors?: Record<string, unknown>;
}

export function pruneRouteStateMaps(routeIds: string[], maps: RouteStateMaps): RouteStateMaps {
  const nextMaps: RouteStateMaps = {
    loaderData: maps.loaderData ? { ...maps.loaderData } : undefined,
    actionData: maps.actionData ? { ...maps.actionData } : undefined,
    deferredData: maps.deferredData ? { ...maps.deferredData } : undefined,
    deferredErrors: maps.deferredErrors ? { ...maps.deferredErrors } : undefined,
    pendingDeferredKeys: maps.pendingDeferredKeys ? { ...maps.pendingDeferredKeys } : undefined,
    routeErrors: maps.routeErrors ? { ...maps.routeErrors } : undefined,
  };

  for (const routeId of routeIds) {
    delete nextMaps.loaderData?.[routeId];
    delete nextMaps.actionData?.[routeId];
    delete nextMaps.deferredData?.[routeId];
    delete nextMaps.deferredErrors?.[routeId];
    delete nextMaps.pendingDeferredKeys?.[routeId];
    delete nextMaps.routeErrors?.[routeId];
  }

  return nextMaps;
}
