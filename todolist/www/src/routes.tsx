import { NoArgsPathDef, NoQueryArgsPathDef } from "rma-baseapp";
import { HomePage } from "./pages/HomePage";
import React from "react";
import { CenterNavBar } from "rma-baseapp";
import { Space } from "antd";

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
  home: new NoArgsPathDef(Layout(HomePage), "/", true),
};
