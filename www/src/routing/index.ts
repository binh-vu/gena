import { matchPath, Path as RRPath } from "react-router";
import { PathDef, ReactComponent, ArgType, ArgSchema } from "./route";
export { ExternalLink, InternalHTMLLink, InternalLink } from "./Link";
export {
  PathDef,
  routeAPIs,
  NoArgsPathDef,
  NoQueryArgsPathDef,
  NoURLArgsPathDef,
  OptionalQueryArgsPathDef,
} from "./route";

/**
 * Find the route that matches with the current location
 */
export function getActiveRouteName(
  location: RRPath,
  routes: { [name: string]: PathDef<any, any> }
): string | undefined {
  for (let [name, route] of Object.entries(routes)) {
    if (matchPath(route.routeDef, location.pathname) !== null) {
      return name;
    }
  }
}

/**
 * Update the component of specific routes -- often for applying layout to the component (add headers/footers)
 *
 * @param routes
 * @param applyFn: mapping from route a function that apply the layout to the component
 * @param ignoredRoutes
 */
export function applyLayout<R extends Record<any, PathDef<any, any>>>(
  routes: R,
  applyFn:
    | Partial<
        Record<
          keyof R,
          (component: ReactComponent, routes: R) => ReactComponent
        >
      >
    | ((component: ReactComponent, routes: R) => ReactComponent),
  ignoredRoutes?: (keyof R)[] | Set<keyof R> | Partial<R>
) {
  if (ignoredRoutes === undefined) {
    ignoredRoutes = new Set();
  }

  if (Array.isArray(ignoredRoutes)) {
    ignoredRoutes = new Set(ignoredRoutes);
  } else if (!(ignoredRoutes instanceof Set)) {
    ignoredRoutes = new Set(Object.keys(ignoredRoutes));
  }

  if (typeof applyFn === "function") {
    for (let [name, route] of Object.entries(routes)) {
      if (ignoredRoutes.has(name)) continue;
      route.routeDef.component = applyFn(route.component, routes);
    }
  } else {
    for (let [name, route] of Object.entries(routes)) {
      if (ignoredRoutes.has(name) || applyFn[name] === undefined) continue;
      route.routeDef.component = applyFn[name]!(route.component, routes);
    }
  }
}

export type { ReactComponent, ArgType, ArgSchema };
