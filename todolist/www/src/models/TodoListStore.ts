import { RStore } from "rma-baseapp";
import { makeObservable, action } from "mobx";

export interface TodoList {
  id: number;
  checked: boolean;
  todo: string;
}

export class TodoListStore extends RStore<number, TodoList> {
  constructor() {
    super(`/api/todo_list`);

    makeObservable(this, {
      toggle: action,
    });
  }

  toggle(item: TodoList) {
    item.checked = !item.checked;
  }
}
