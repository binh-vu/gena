import { message } from "antd";
import { AxiosError } from "axios";
import React from "react";
import { TodoListStore } from "./TodoListStore";

export const stores = {
  todolistStore: new TodoListStore(),
};
export type IStore = Readonly<typeof stores>;

function ajaxErrorHandler(error: AxiosError<any>) {
  message.error(
    "Error while talking with the server. Check console for more details.",
    10
  );
  console.error(error);
}

for (let store of Object.values(stores)) {
  store.ajaxErrorHandler = ajaxErrorHandler;
}

export const StoreContext = React.createContext<IStore>(stores);

export function useStores(): IStore {
  return React.useContext(StoreContext);
}

export { TodoListStore as VariableStore };
export type { TodoList } from "./TodoListStore";
