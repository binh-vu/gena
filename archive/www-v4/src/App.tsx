import { Router, Switch, Route } from "react-router-dom";
import { NotFoundComponent } from "./components";
import { history, PathDef } from "./routing";

export default function App({
  routes,
}: {
  enUSLocale?: boolean;
  routes: { [name: string]: PathDef<any, any> };
}) {
  return (
    <Router history={history}>
      <div className="app-body">
        <Switch>
          {Object.entries(routes).map(([key, route]) => (
            <Route key={key} {...(route as PathDef<any, any>).routeDef} />
          ))}
          <Route component={NotFoundComponent} />
        </Switch>
      </div>
    </Router>
  );
}
