import { Router, Switch, Route } from "react-router-dom";
import NotFoundPage from "./pages/NotFoundPage";
import { history, PathDef } from "./routing";
import enUSIntl from "antd/lib/locale/en_US";
import { ConfigProvider } from "antd";

export default function App({
  enUSLocale,
  routes,
}: {
  enUSLocale?: boolean;
  routes: { [name: string]: PathDef<any, any> };
}) {
  // has to wrap the config provider here when creating components
  // otherwise, create components first, store in an object, and wrap won't work
  return (
    <ConfigProvider locale={enUSLocale === true ? enUSIntl : undefined}>
      <Router history={history}>
        <div className="app-body">
          <Switch>
            {Object.entries(routes).map(([key, route]) => (
              <Route key={key} {...(route as PathDef<any, any>).routeDef} />
            ))}
            <Route component={NotFoundPage} />
          </Switch>
        </div>
      </Router>
    </ConfigProvider>
  );
}
