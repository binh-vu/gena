import { Location } from "history";
import { PLATFORM } from "../env";
import { createBrowserHistory, createMemoryHistory } from "history";
import { Modal } from "antd";
import { matchPath, useLocation } from "react-router";
import React, { useMemo } from "react";

function getUserConfirmation(
  message: string,
  callback: (result: boolean) => void
) {
  Modal.confirm({
    title: message,
    okText: "Leave",
    okType: "primary",
    okButtonProps: { danger: true },
    cancelText: "Stay",
    onOk() {
      callback(true);
    },
    onCancel() {
      // reverse ok and cancel doesn't work since antd detect escape keyword as cancel.
      callback(false);
    },
  });
}

export const history =
  PLATFORM === "native"
    ? createMemoryHistory({
        getUserConfirmation,
      })
    : createBrowserHistory({
        getUserConfirmation,
      });

export type ReactComponent =
  | React.ComponentClass<any, any>
  | React.FunctionComponent<any>;

export type ArgType = {
  string: string;
  number: number;
  boolean: boolean;
  optionalstring: string | undefined;
  optionalnumber: number | undefined;
  optionalboolean: number | undefined;
};

export type ArgSchema<T extends Record<string, keyof ArgType>> = {
  [K in keyof T]: ArgType[T[K]];
};

export class PathDef<
  U extends Record<string, keyof ArgType>,
  Q extends Record<string, keyof ArgType>
> {
  // contain the schema of url parameters
  protected urlSchema: U;
  // contain the schema of query parameters
  protected querySchema: Q;
  // definition of a path in react-router styles. e.g., /accounts/:id
  public pathDef: string;
  // is equivalent to the `exact` property of the Route component in react-router (whether it should match with its descendant)
  public exact: boolean;
  // equivalent to `strict`: when true, a path that has a trailing slash will only match a location.pathname with a trailing slash. This has no effect when there are additional URL segments in the location.pathname.
  public strict: boolean;
  // hold properties of Route component in react-router
  public routeDef: {
    path: string;
    exact: boolean;
    strict: boolean;
    component: ReactComponent;
  };
  public component: ReactComponent;

  public constructor({
    urlSchema = {} as U,
    querySchema = {} as Q,
    component,
    pathDef,
    exact = false,
    strict = false,
  }: {
    urlSchema?: U;
    querySchema?: Q;
    component: ReactComponent;
    pathDef: string;
    exact?: boolean;
    strict?: boolean;
  }) {
    this.urlSchema = urlSchema;
    this.querySchema = querySchema;
    this.pathDef = pathDef;
    this.exact = exact;
    this.strict = strict;
    this.routeDef = { path: pathDef, exact, strict, component };
    this.component = component;
  }

  /**
   * Create a path based on the given arguments.
   *
   * Note: this function should be used only when we build a link for <a> element
   * since it won't follow the semantic of react-router but more like when you open a link
   * at the first time in the browser (that's why for hash history, we have to add `#`)
   */
  public getURL(urlArgs: ArgSchema<U>, queryArgs: ArgSchema<Q>): string {
    let path = this.pathDef;

    if (urlArgs !== null) {
      for (let v in urlArgs) {
        path = path.replace(`:${v}`, urlArgs[v] as any as string);
      }
    }

    const query = new URLSearchParams(queryArgs as any).toString();
    if (query.length > 0) {
      path = `${path}?${query}`;
    }

    return path;
  }

  /**
   * Create a location that the history object can be pushed
   */
  public location(
    urlArgs: ArgSchema<U>,
    queryArgs: ArgSchema<Q>
  ): Location<any> {
    let path = this.pathDef;
    for (let v in urlArgs) {
      path = path.replace(`:${v}`, urlArgs[v] as any as string);
    }

    let query = new URLSearchParams(queryArgs as any).toString();
    query = query.length > 0 ? `?${query}` : query;

    return {
      pathname: path,
      search: query,
      hash: "",
      state: undefined,
    };
  }

  /**
   * Build a path that can be used to navigate to a link
   */
  public path(urlArgs: ArgSchema<U>, queryArgs: ArgSchema<Q>): Path<U, Q> {
    return new Path(this, urlArgs, queryArgs);
  }

  /** React hook to get URL parameters */
  public useURLParams(): ArgSchema<U> | null {
    const location = useLocation();
    return useMemo(() => this.getURLArgs(location), [location.pathname]);
  }

  /** React hook to get query parameters */
  public useQueryParams() {
    const location = useLocation();
    return useMemo(() => this.getQueryArgs(location), [location.search]);
  }

  /** React hook to get parameters */
  public useParams(): { url: ArgSchema<U> | null; query: ArgSchema<Q> | null } {
    return { url: this.useURLParams(), query: this.useQueryParams() };
  }

  /**
   * Get URL params of this route.
   * @returns null if the route doesn't match or any parameter fails to pass the runtime type check
   */
  public getURLArgs(location: Location<any>): ArgSchema<U> | null {
    const m = matchPath(location.pathname, this.routeDef);
    if (m === null) {
      return null;
    }
    return this.parse(m.params as any, this.urlSchema);
  }

  /**
   * Get query params of this route
   * @returns null if the route doesn't match or any parameter fails to pass the runtime type check
   */
  public getQueryArgs(location: Location<any>): ArgSchema<Q> | null {
    const params = new URLSearchParams(location.search);
    const query = this.parse(
      Object.fromEntries(params.entries()),
      this.querySchema
    );
    if (query !== null && Object.values(query).every((x) => x === undefined)) {
      return null;
    }
    return query;
  }

  /**
   * Parse the object with the schema
   *
   * @param object
   * @param schema
   * @returns
   */
  protected parse<T extends Record<string, keyof ArgType>>(
    object: any,
    schema: T
  ): ArgSchema<T> | null {
    const output = {} as any;
    for (const [prop, propType] of Object.entries(schema)) {
      const value = object[prop];
      switch (propType) {
        case "number":
          if (value === undefined) {
            return null;
          }
          output[prop] = parseFloat(value);
          if (!Number.isFinite(output[prop])) {
            return null;
          }
          break;
        case "boolean":
          if (value === undefined || value !== "true" || value !== "false") {
            return null;
          }
          output[prop] = value === "true";
          break;
        case "string":
          if (value === undefined) {
            return null;
          }
          output[prop] = value;
          break;
        case "optionalnumber":
          if (value === undefined) {
            continue;
          }
          output[prop] = parseFloat(value);
          if (!Number.isFinite(output[prop])) {
            return null;
          }
          break;
        case "optionalboolean":
          if (value === undefined) {
            continue;
          }
          if (value !== "true" || value !== "false") {
            return null;
          }
          output[prop] = value === "true";
          break;
        case "optionalstring":
          if (value === undefined) {
            continue;
          }
          output[prop] = value;
          break;
      }
    }
    return output as ArgSchema<T>;
  }
}

/**
 * Overwrite the PathDef class to provide a better using experience
 */
export class NoArgsPathDef extends PathDef<{}, {}> {
  public getURL(): string {
    return super.getURL({}, {});
  }

  public location(): Location<any> {
    return super.location({}, {});
  }

  public path(): Path<{}, {}> {
    return super.path({}, {});
  }
}

/**
 * Overwrite the PathDef class to provide a better using experience
 */
export class NoQueryArgsPathDef<
  U extends Record<string, keyof ArgType>
> extends PathDef<U, {}> {
  public getURL(urlArgs: ArgSchema<U>): string {
    return super.getURL(urlArgs, {});
  }

  public location(urlArgs: ArgSchema<U>): Location<any> {
    return super.location(urlArgs, {});
  }

  public path(urlArgs: ArgSchema<U>): Path<U, {}> {
    return super.path(urlArgs, {});
  }
}

export class NoURLArgsPathDef<
  Q extends Record<string, keyof ArgType>
> extends PathDef<{}, Q> {
  public getURL(queryArgs: ArgSchema<Q>): string {
    return super.getURL({}, queryArgs);
  }

  public location(queryArgs: ArgSchema<Q>): Location<any> {
    return super.location({}, queryArgs);
  }

  public path(queryArgs: ArgSchema<Q>): Path<{}, Q> {
    return super.path({}, queryArgs);
  }
}

export class OptionalQueryArgsPathDef<
  U extends Record<string, keyof ArgType>,
  Q extends Record<string, keyof ArgType>
> extends PathDef<U, Q> {
  public getURL(urlArgs: ArgSchema<U>, queryArgs?: ArgSchema<Q>): string {
    return super.getURL(urlArgs, queryArgs || ({} as ArgSchema<Q>));
  }

  public location(
    urlArgs: ArgSchema<U>,
    queryArgs?: ArgSchema<Q>
  ): Location<any> {
    return super.location(urlArgs, queryArgs || ({} as ArgSchema<Q>));
  }

  public path(urlArgs: ArgSchema<U>, queryArgs?: ArgSchema<Q>): Path<U, Q> {
    return super.path(urlArgs, queryArgs || ({} as ArgSchema<Q>));
  }
}

class Path<
  U extends Record<string, keyof ArgType>,
  Q extends Record<string, keyof ArgType>
> {
  private pathDef: PathDef<U, Q>;
  private urlArgs: ArgSchema<U>;
  private queryArgs: ArgSchema<Q>;

  public constructor(
    pathDef: PathDef<U, Q>,
    urlArgs: ArgSchema<U>,
    queryArgs: ArgSchema<Q>
  ) {
    this.pathDef = pathDef;
    this.urlArgs = urlArgs;
    this.queryArgs = queryArgs;
  }

  /**
   * Open this path
   */
  public open() {
    history.push(this.pathDef.location(this.urlArgs, this.queryArgs));
  }

  /**
   * Handler for a mouse event navigation (e.g., linking on an <a> element)
   */
  public mouseClickNavigationHandler = (e?: React.MouseEvent) => {
    if (e !== undefined) {
      e.preventDefault();
    }

    if (e !== undefined && (e.ctrlKey || e.metaKey)) {
      // holding ctrl or cmd key, we should open in new windows
      window.open(this.pathDef.getURL(this.urlArgs, this.queryArgs), "_blank");
      // keep the focus on this page
      window.focus();
    } else {
      history.push(this.pathDef.location(this.urlArgs, this.queryArgs));
    }
  };
}

/**
 * Export routing functions to global navigation behaviour on different platforms
 */
export const routeAPIs = {
  internalHTMLLinkClickFnId: "window._routeAPIs.internalHTMLLinkClick",
  history: history,
  internalHTMLLinkClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    let href = (e.target as any).getAttribute("href");
    if (e.ctrlKey || e.metaKey) {
      // holding ctrl or cmd key, we should open in new windows, even in native, because it is internal, another window still work
      window.open(href, "_blank");
      window.focus();
    } else {
      history.push(href);
    }
  },
  goBack: () => history.goBack(),
  goForward: () => history.goForward(),
  openInternalLink: (href: string) => {
    history.push(href);
  },
};
(window as any)._routeAPIs = routeAPIs;
