import React from "react";
import { Button, ButtonProps } from "antd";
import { ArgSchema, ArgType } from "./route";
import { PLATFORM } from "../env";
import { PathDef, routeAPIs } from "./route";

/**
 * This file contains all helper to dealing with Links and Navigation in the application so that we can handle it easier in different platforms
 */

export const InternalLink = <
  U extends Record<string, keyof ArgType>,
  Q extends Record<string, keyof ArgType>
>(
  props: {
    path: PathDef<U, Q>;
    urlArgs: ArgSchema<U>;
    queryArgs: ArgSchema<Q>;
  } & Omit<React.HTMLProps<HTMLAnchorElement>, "onClick">
) => {
  const { path, urlArgs, queryArgs, children, ...restprops } = props;
  const onClick = (e: any) => {
    path.path(urlArgs, queryArgs).mouseClickNavigationHandler(e);
  };

  return (
    <a href={path.getURL(urlArgs, queryArgs)} onClick={onClick} {...restprops}>
      {children}
    </a>
  );
};

export const InternalLinkBtn = <
  U extends Record<string, keyof ArgType>,
  Q extends Record<string, keyof ArgType>
>(
  props: {
    path: PathDef<U, Q>;
    urlArgs: ArgSchema<U>;
    queryArgs: ArgSchema<Q>;
  } & Omit<ButtonProps, "onClick">
) => {
  const { path, urlArgs, queryArgs, children, ...restprops } = props;
  const onClick = (e: any) => {
    props.path
      .path(props.urlArgs, props.queryArgs)
      .mouseClickNavigationHandler(e);
  };

  return (
    <Button onClick={onClick} {...restprops}>
      {children}
    </Button>
  );
};

export const ExternalLink = ({
  href,
  openInNewPage = false,
  children,
  ...restprops
}: {
  href: string;
  openInNewPage?: boolean;
} & Omit<React.HTMLProps<HTMLAnchorElement>, "href" | "target" | "rel">) => {
  return (
    <a
      href={href}
      target={openInNewPage ? "_blank" : undefined}
      rel="noopener noreferrer"
      {...restprops}
    >
      {children}
    </a>
  );
};

export function InternalHTMLLink(
  href: string,
  text: string,
  className?: string
) {
  if (href.startsWith("#") && PLATFORM === "native") {
    // relative link in the samepage does not work in native mode, so we have to fake it...
    return `<span className="a-fake-href ${className}">${text}</span>`;
  }
  return `<a href="${href}" class="${className}" data-internal-link="true" onClick="${routeAPIs.internalHTMLLinkClickFnId}(event);">${text}</a>`;
}
