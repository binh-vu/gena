import { Menu } from "antd";
import { useLocation, useNavigate } from "react-router";
import { getActiveRouteName, PathDef } from "gena-app";
import React from "react";
import styles from "./Navbar.module.css";

type MenuItemProps = {
  children: string | JSX.Element;
  icon?: JSX.Element;
  danger?: boolean;
  disabled?: boolean;
};

interface Props<R> {
  menus: Partial<Record<keyof R, string | JSX.Element | MenuItemProps>>;
  routes: R;
  className?: string;
  style?: React.CSSProperties;
  isFirstItemLogo?: boolean;
}

export const CenterNavBar = <R extends Record<any, PathDef<any, any>>>({
  menus,
  routes,
  className,
  style,
  isFirstItemLogo,
}: Props<R>) => {
  const location = useLocation();
  const navigate = useNavigate();
  const openMenu = (e: { key: keyof R }) => {
    routes[e.key].path({}, {}).open(navigate);
  };

  const items = Object.keys(menus).map((routeName, index) => {
    const className = isFirstItemLogo === true && index === 0 ? "logo" : "";
    return getMenuItem(routeName, className, menus[routeName]!);
  });
  const activeRouteName = getActiveRouteName(location, routes);

  return (
    <Menu
      mode="horizontal"
      className={
        styles.centerNavBar + (className !== undefined ? " " + className : "")
      }
      style={style}
      onClick={openMenu}
      selectedKeys={
        activeRouteName !== undefined ? [activeRouteName] : undefined
      }
    >
      {items}
    </Menu>
  );
};

export const LeftNavBar = <R extends Record<any, PathDef<any, any>>>({
  menus,
  routes,
  className,
  style,
  isFirstItemLogo,
}: Props<R>) => {
  const location = useLocation();
  const navigate = useNavigate();
  const openMenu = (e: { key: keyof R }) => {
    routes[e.key].path({}, {}).open(navigate);
  };

  const items = Object.keys(menus).map((routeName, index) => {
    const className = isFirstItemLogo === true && index === 0 ? "logo" : "";
    return getMenuItem(routeName, className, menus[routeName]!);
  });
  const activeRouteName = getActiveRouteName(location, routes);

  return (
    <Menu
      mode="horizontal"
      className={
        styles.leftNavBar + (className !== undefined ? " " + className : "")
      }
      style={style}
      onClick={openMenu}
      selectedKeys={
        activeRouteName !== undefined ? [activeRouteName] : undefined
      }
    >
      {items}
    </Menu>
  );
};

function getMenuItem(
  key: string,
  className: string,
  props: string | JSX.Element | MenuItemProps
) {
  let children, realprops;

  if (typeof props === "string") {
    children = props;
  } else if (React.isValidElement(props)) {
    children = props;
  } else {
    const { children: children2, ...realprops2 } = props as MenuItemProps;
    children = children2;
    realprops = realprops2;
  }

  return (
    <Menu.Item className={className} key={key} {...realprops}>
      {children}
    </Menu.Item>
  );
}
