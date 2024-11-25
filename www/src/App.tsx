import React from "react";
import { Routes, Route, BrowserRouter, MemoryRouter } from "react-router";
import { PathDef } from "./routing";
import { NotFoundComponent } from "./components";
import { PLATFORM } from "./env";

export default function App({
  routes,
  strict = false,
}: {
  enUSLocale?: boolean;
  routes: { [name: string]: PathDef<any, any> };
  strict: boolean;
}) {
  const child = (
    <div className="app-body">
      <Routes>
        {Object.entries(routes).map(([key, route]) => (
          <Route key={key} {...(route as PathDef<any, any>).routeDef} />
        ))}
        <Route element={<NotFoundComponent />} />
      </Routes>
    </div>
  );

  let main = undefined;

  if (PLATFORM === "native") {
    main = <MemoryRouter>{child}</MemoryRouter>;
  } else {
    main = <BrowserRouter>{child}</BrowserRouter>;
  }

  if (strict) {
    return <React.StrictMode>{main}</React.StrictMode>;
  }
  return main;
}
