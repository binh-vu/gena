import { Record, SimpleCRUDStore } from "rma-baseapp";

export interface Todo extends Record<number> {
  id: number;
  checked: boolean;
  todo: string;
}

export class TodoListStore extends SimpleCRUDStore<number, Todo> {
  constructor() {
    super(`/api/todo_list`);
  }
}
