import React from "react";
import { TodoListStore } from "./TodoListStore";

export const stores = {
  todolistStore: new TodoListStore(),
};
export type IStore = Readonly<typeof stores>;
export const StoreContext = React.createContext<IStore>(stores);

export function useStores(): IStore {
  return React.useContext(StoreContext);
}

export { TodoListStore as VariableStore };
export type { Todo } from "./TodoListStore";
