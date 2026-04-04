export interface RouteLocationLike {
  pathname: string;
  query: Record<string, string>;
  hash: string;
}

export function createRouteLocationKey(route: RouteLocationLike): string {
  const query = new URLSearchParams(route.query).toString();
  return `${route.pathname}${query ? `?${query}` : ""}${route.hash}`;
}
