import { Space } from "antd";
import React from "react";
import { applyLayout, NoArgsPathDef } from "gena-app";
import { HomePage } from "./pages/HomePage";
import { CenterNavBar } from "./components/NavBar";

/*************************************************************************************
 * Layouts of the application
 */

export const Layout = (
  component: React.FunctionComponent<any> | React.ComponentClass<any, any>
) => {
  return (props: any) => {
    const element = React.createElement(component, props);
    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <CenterNavBar menus={{ home: "Home" }} routes={routes} />
        {element}
      </Space>
    );
  };
};

/*************************************************************************************
 * Definitions for routes in this application:
 */
export const routes = {
  home: new NoArgsPathDef({
    component: HomePage,
    pathDef: "/",
    exact: true,
  }),
};

// applying layout to all routes
applyLayout(routes, Layout);
