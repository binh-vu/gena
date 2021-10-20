import { Menu } from "antd";
import { WithStyles, withStyles } from "@material-ui/styles";
import { useLocation } from "react-router-dom";
import { getActiveRouteName, PathDef } from "../routing";

const inlineStyles = {
  centerNavBar: {
    justifyContent: "center",
    boxShadow: "0 2px 8px #f0f1f2",
  },
};

interface Props<R> {
  menus: Partial<Record<keyof R, string>>;
  routes: R;
  className?: string;
  styles?: React.CSSProperties;
}
type Component = <R extends Record<any, PathDef<any, any>>>(
  p: Props<R>
) => JSX.Element;

export const CenterNavBar = withStyles(inlineStyles)(
  <R extends Record<any, PathDef<any, any>>>({
    classes,
    menus,
    routes,
    className,
    styles,
  }: Props<R> & WithStyles<typeof inlineStyles>) => {
    const location = useLocation();
    const openMenu = (e: { key: keyof R }) => {
      routes[e.key].path(null, null).open();
    };

    const items = Object.keys(menus).map((routeName) => {
      return <Menu.Item key={routeName}>{menus[routeName]}</Menu.Item>;
    });
    const activeRouteName = getActiveRouteName(location, routes);

    return (
      <Menu
        mode="horizontal"
        className={
          classes.centerNavBar +
          (className !== undefined ? " " + className : "")
        }
        style={styles}
        onClick={openMenu}
        selectedKeys={
          activeRouteName !== undefined ? [activeRouteName] : undefined
        }
      >
        {items}
      </Menu>
    );
  }
) as Component;
