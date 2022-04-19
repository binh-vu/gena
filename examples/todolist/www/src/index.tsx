import ReactDOM from "react-dom";
import { App } from "rma-baseapp";
import "./index.css";
import { StoreContext, stores } from "./models";
import reportWebVitals from "./reportWebVitals";
import { routes } from "./routes";

ReactDOM.render(
  <StoreContext.Provider value={stores}>
    <App enUSLocale={false} routes={routes} />
  </StoreContext.Provider>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
