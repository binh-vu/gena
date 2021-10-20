import { Location } from "history";
import { matchPath } from "react-router";
import { PathDef } from "./route";
export { ExternalLink, InternalHTMLLink, InternalLink } from "./Link";
export {
  history,
  PathDef,
  routeAPIs,
  NoArgsPathDef,
  NoQueryArgsPathDef,
} from "./route";

/**
 * Find the route that matches with the current location
 */
export function getActiveRouteName(
  location: Location<any>,
  routes: { [name: string]: PathDef<any, any> }
): string | undefined {
  for (let [name, route] of Object.entries(routes)) {
    if (matchPath(location.pathname, route.routeDef) !== null) {
      return name;
    }
  }
}
