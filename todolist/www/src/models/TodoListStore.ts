import { action, makeObservable } from "mobx";
import { Record, SimpleCRUDStore } from "rma-baseapp";
import { SimpleDraftUpdateRecord } from "rma-baseapp/lib/esm/models/Record";

export interface Todo extends Record<number> {
  id: number;
  checked: boolean;
  todo: string;
}

export class TodoListStore extends SimpleCRUDStore<number, Todo> {
  constructor() {
    super(`/api/todo_list`);
    makeObservable(this, {
      toggle: action,
    });
  }

  toggle(item: Todo) {
    item.checked = !item.checked;
    this.update(new SimpleDraftUpdateRecord(item));
  }
}
