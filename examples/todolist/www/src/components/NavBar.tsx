import { Menu } from "antd";
import { makeStyles } from "@mui/styles";
import { useLocation } from "react-router-dom";
import { getActiveRouteName, PathDef } from "gena-app";
import React from "react";

const useStyles = makeStyles({
  centerNavBar: {
    justifyContent: "center",
    boxShadow: "0 2px 8px #f0f1f2",
  },
  leftNavBar: {
    "& .logo::after": {
      borderBottom: "none !important",
      transition: "none !important",
    },
    "& .logo:hover::after": {
      borderBottom: "none !important",
      transition: "none !important",
    },
    "& .logo img": {
      height: 24,
      borderRadius: 4,
      marginTop: -2,
    },
    paddingLeft: 24,
    paddingRight: 24,
    boxShadow: "0 2px 8px #f0f1f2",
  },
});

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
  const classes = useStyles();
  const location = useLocation();
  const openMenu = (e: { key: keyof R }) => {
    routes[e.key].path({}, {}).open();
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
        classes.centerNavBar + (className !== undefined ? " " + className : "")
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
  const classes = useStyles();
  const location = useLocation();
  const openMenu = (e: { key: keyof R }) => {
    routes[e.key].path({}, {}).open();
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
        classes.leftNavBar + (className !== undefined ? " " + className : "")
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
