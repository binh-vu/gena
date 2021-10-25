import React from "react";
import { Result, Space, Button } from "antd";
import { routeAPIs } from "../routing";
import { NoArgsPathDef } from "../routing/route";

const onClickGoHome = new NoArgsPathDef(() => null, "/", true).path()
  .mouseClickNavigationHandler;

const NotFoundPage: React.FunctionComponent<{}> = () => {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Sorry, the page you visited does not exist."
      extra={
        <Space>
          <Button onClick={routeAPIs.goBack}>Back</Button>
          <Button type="primary" onClick={onClickGoHome}>
            Home
          </Button>
        </Space>
      }
    />
  );
};

export default NotFoundPage;
