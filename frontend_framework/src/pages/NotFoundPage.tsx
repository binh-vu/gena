import React from "react";
import { Button } from "antd";
import { routeAPIs } from "../routing";
import { NoArgsPathDef } from "../routing/route";

const onClickGoHome = new NoArgsPathDef(() => null, "/", true).path()
  .mouseClickNavigationHandler;

const NotFoundPage: React.FunctionComponent<{}> = () => {
  return (
    <div style={{ textAlign: "center" }}>
      <h1>404 Resource Not Found</h1>
      <div>
        <Button type="link" size="large" onClick={routeAPIs.goBack}>
          Go Back
        </Button>
        <Button type="link" size="large" onClick={onClickGoHome}>
          Home
        </Button>
      </div>
    </div>
  );
};

export default NotFoundPage;
