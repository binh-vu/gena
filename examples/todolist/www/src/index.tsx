import { App } from "gena-app";
import { StoreContext, stores } from "./models";
import reportWebVitals from "./reportWebVitals";
import "./index.css";
import { routes } from "./routes";

import { createRoot } from "react-dom/client";
const container = document.getElementById("root");
const root = createRoot(container!); // createRoot(container!) if you use TypeScript
root.render(
  <StoreContext.Provider value={stores}>
    <App routes={routes} strict={false} />
  </StoreContext.Provider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
