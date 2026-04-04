import type {
  ActionShouldRevalidateArgs,
  NavigationShouldRevalidateArgs,
  PageRouteMatch,
  PageRouteRecord,
  ShouldRevalidateArgs,
} from "../router/types.ts";
import type { AppModule } from "./types.ts";

export interface RevalidationPlan {
  routeIds: string[];
}

export interface AppRevalidationPlan {
  shouldRevalidate: boolean;
}

export interface CreateRevalidationPlanOptions {
  currentMatch: PageRouteMatch | null;
  nextMatch: PageRouteMatch;
  currentUrl: URL | null;
  nextUrl: URL;
  actionRouteId?: string;
  formMethod?: string;
  formAction?: string;
  actionStatus?: number;
  actionResult?: unknown;
}

export function createRevalidationPlan(options: CreateRevalidationPlanOptions): RevalidationPlan {
  const defaultRouteIds = createDefaultRevalidatedRouteIds(options);
  const isActionRevalidation = options.actionRouteId !== undefined;
  const routeIds = options.nextMatch.matches
    .filter((route) => route.module.loader)
    .filter((route) =>
      shouldRevalidateRoute(
        route,
        isActionRevalidation
          ? createActionShouldRevalidateArgs(options, defaultRouteIds.has(route.id))
          : createNavigationShouldRevalidateArgs(options, defaultRouteIds.has(route.id)),
      ),
    )
    .map((route) => route.id);

  return {
    routeIds,
  };
}

export function createAppRevalidationPlan(
  app: AppModule | undefined,
  options: CreateRevalidationPlanOptions,
): AppRevalidationPlan {
  if (!app?.loader) {
    return {
      shouldRevalidate: false,
    };
  }

  if (!app.shouldRevalidate) {
    return {
      shouldRevalidate: createDefaultAppShouldRevalidate(options),
    };
  }

  const args =
    options.actionRouteId !== undefined
      ? createActionShouldRevalidateArgs(options, createDefaultAppShouldRevalidate(options))
      : createNavigationShouldRevalidateArgs(options, createDefaultAppShouldRevalidate(options));

  return {
    shouldRevalidate: app.shouldRevalidate(args),
  };
}

function createDefaultRevalidatedRouteIds(options: CreateRevalidationPlanOptions): Set<string> {
  const { currentMatch, nextMatch, actionResult, actionRouteId } = options;

  if (!currentMatch) {
    return new Set(nextMatch.matches.map((route) => route.id));
  }

  if (actionResult !== undefined) {
    if (!actionRouteId) {
      return new Set();
    }

    const actionRoute = nextMatch.matches.find((route) => route.id === actionRouteId);
    return new Set(actionRoute?.module.loader ? [actionRoute.id] : []);
  }

  const currentMatches = currentMatch.matches;
  const nextMatches = nextMatch.matches;
  const divergenceIndex = findDivergenceIndex(currentMatches, nextMatches);

  if (divergenceIndex < nextMatches.length) {
    return new Set(nextMatches.slice(divergenceIndex).map((route) => route.id));
  }

  if (
    currentMatch.pathname !== nextMatch.pathname ||
    !isSameQuery(currentMatch.query, nextMatch.query)
  ) {
    const leafRoute = nextMatch.route;
    return new Set(leafRoute.module.loader ? [leafRoute.id] : []);
  }

  return new Set();
}

function createDefaultAppShouldRevalidate(options: CreateRevalidationPlanOptions): boolean {
  if (!options.currentUrl) {
    return true;
  }

  if (options.actionRouteId !== undefined) {
    return false;
  }

  return (
    options.currentUrl.pathname !== options.nextUrl.pathname ||
    options.currentUrl.search !== options.nextUrl.search
  );
}

function shouldRevalidateRoute(route: PageRouteRecord, args: ShouldRevalidateArgs): boolean {
  if (!route.module.shouldRevalidate) {
    return args.defaultShouldRevalidate;
  }

  if (args.type === "action") {
    return route.module.shouldRevalidate(args);
  }

  return route.module.shouldRevalidate(args);
}

function createNavigationShouldRevalidateArgs(
  options: CreateRevalidationPlanOptions,
  defaultShouldRevalidate: boolean,
): NavigationShouldRevalidateArgs {
  return {
    type: "navigation",
    currentUrl: options.currentUrl,
    nextUrl: options.nextUrl,
    currentParams: options.currentMatch?.params ?? {},
    nextParams: options.nextMatch.params,
    defaultShouldRevalidate,
  };
}

function createActionShouldRevalidateArgs(
  options: CreateRevalidationPlanOptions,
  defaultShouldRevalidate: boolean,
): ActionShouldRevalidateArgs {
  if (!options.actionRouteId) {
    throw new Error("actionRouteId is required for action revalidation");
  }

  return {
    type: "action",
    currentUrl: options.currentUrl,
    nextUrl: options.nextUrl,
    currentParams: options.currentMatch?.params ?? {},
    nextParams: options.nextMatch.params,
    formMethod: options.formMethod ?? "POST",
    formAction: options.formAction ?? options.nextUrl.pathname,
    actionStatus: options.actionStatus ?? 200,
    actionRouteId: options.actionRouteId,
    actionResult: options.actionResult,
    defaultShouldRevalidate,
  };
}

function findDivergenceIndex(
  currentMatches: PageRouteRecord[],
  nextMatches: PageRouteRecord[],
): number {
  const length = Math.min(currentMatches.length, nextMatches.length);

  for (let index = 0; index < length; index += 1) {
    if (currentMatches[index]?.id !== nextMatches[index]?.id) {
      return index;
    }
  }

  return length;
}

function isSameQuery(
  currentQuery: Record<string, string>,
  nextQuery: Record<string, string>,
): boolean {
  const currentEntries = Object.entries(currentQuery);
  const nextEntries = Object.entries(nextQuery);

  if (currentEntries.length !== nextEntries.length) {
    return false;
  }

  return currentEntries.every(([key, value]) => nextQuery[key] === value);
}
