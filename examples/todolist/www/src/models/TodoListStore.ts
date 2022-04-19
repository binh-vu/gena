import { Record, SimpleCRUDStore } from "gena-app";

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
