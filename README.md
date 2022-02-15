# rad

Framework to help to build (web) application faster.

1. `flask_peewee_restful`: generate restful APIs from peewee models (i.e., specification of database table).
2. `frontend_framework`: provides basic structure for frontend application (state management, routing).

For demo, see the [todolist folder](/todolist).

# Getting started

We are going to build a simple todolist app to demonstrate how to use this framework. See the [todolist folder](/todolist) for the complete source code.

### Setup the project:

1. create the python project (server code): `poetry new todolist` (you need [Poetry](https://python-poetry.org/) to run this command)
2. move inside the project folder: `cd todolist`
3. add our backend library: `poetry add flask-peewee-restful`
4. create a `www` directory containing your frontend code using [`create-react-app`](https://create-react-app.dev/docs/adding-typescript/): (`yarn create react-app www --template typescript`)
5. add our frontend library: `cd www; yarn add rma-baseapp; cd ..` -- this will modify your [`www/package.json`](/todolist/www/package.json) file.
6. modify the build script in [`www/package.json`](/todolist/www/package.json) to tell `create-react-app` to build static files into [`todolist/www`](/todolist/todolist/www) directory inside the python package: `"build": "BUILD_PATH='../todolist/www' react-scripts build"`. This allows us to distribute both frontend and backend in a single python package.
7. add `"proxy": "http://localhost:5000"` to the [`www/package.json`](/todolist/www/package.json). This allows us to send the request to the server during development.

After this step, you will have the following folder structure:

    todolist
    ├── todolist                   # our backend code
    │   ├── __init__.py
    ├── pyproject.toml
    ├── www                        # our frontend code

### Backend

#### Define database schema

We use [`peewee`](https://docs.peewee-orm.com/), an ORM library, to define our database schema.

First, let's create a file containing our schema: [`todolist/models.py`](/todolist/todolist/models.py). In this simple todo list, we only have one table `todo_list`, which has two fields: `checked` and `todo`.

```python
import os
from peewee import SqliteDatabase, Model, BooleanField, TextField


db = SqliteDatabase(os.environ["DBFILE"])


class TodoList(Model):
    class Meta:
        database = db
        db_table = "todo_list"

    checked = BooleanField()
    todo = TextField()
```

(Optionally) We add the following code to the same file to insert some dummy data to our database for testing

```python
if not os.path.exists(os.environ['DBFILE']):
    db.create_tables([TodoList], safe=True)
    TodoList.insert_many([
        {"checked": False, "todo": "go grocery"},
        {"checked": False, "todo": "do laundry"},
    ]).execute()
```

#### Create APIs

With our backend library, creating APIs is as simple as calling a function `generate_api` with the ORM model `TodoList`:

```python
import os
from flask_peewee_restful import generate_app, generate_api
from todolist.models import TodoList

app = generate_app(
    controllers=[generate_api(model) for model in [TodoList]],
    pkg_dir=os.path.dirname(__file__)
)
```

Under the hood, [`generate_api`](/flask_peewee_restful/api_generator.py) uses the specification in the model to automatically generate a blueprint containing the following endpoints (sometimes are called views or controllers):

1. `GET /{table_name}`: querying records matched a query.
2. `GET /{table_name}/<id>`: get a record by id
3. `HEAD /{table_name}/<id>`: whether a record with the given id exists.
4. `POST /{table_name}/find_by_ids`: querying list of records by their ids
5. `POST /{table_name}`: create a record
6. `PUT /{table_name}/<id>`: update a record
7. `DELETE /{table_name}/<id>`: delete a record
8. `DELETE /{table_name}`: truncate the whole table, only available if the `enable_truncate_table` parameter is set to be `True`.

You can extend the blueprint to add additional endpoints or overwrite some if you needed. Inputs from the users are automatically validate based on the type of the field, or you can provide your own deserializer (whose job is also validate the value) for a particular field via the `deserializer` parameter. You can also provide your own `serializer` to control how the data should be serialize.

The outer function `generate_app` will returns the Flask application. It takes three parameters

- `controllers`: a list of [Flask's blueprints](https://flask.palletsprojects.com/en/2.0.x/blueprints/) or a python package, in which the blueprints are discovered automatically. This is useful if you organize your blueprints in separated files. All endpoints defined in the blueprints have url prefix `/api` (`/{table_name}` becomes `/api/{table_name}`).
- `pkg_dir`: the path to our `todolist` package. Our app will serve the static files from `{pkg_dir}/www` folder.
- `log_sql_queries`: whether to log sql queries when we are in development mode.

With the given app, we finally can start our server with: `DBFILE=./todolist.db FLASK_APP=todolist/app.py flask run`. Note: remember to activate your virtual environment first with `poetry shell`.

### Frontend

#### Create Stores

Our frontend library uses [React](https://reactjs.org/) and provides state management with [MobX](https://mobx.js.org/)) and routing with [ReactRouter](https://reactrouter.com/) out of the box. In addition, most of the functions are typed so that refactoring and maintaining is easier.

To start, we create stores which contains all of the data of our application. A store also contains other functions to create, update, delete, and query records from the server. If you haven't familiar with MobX, please check out their [documentation](https://mobx.js.org/the-gist-of-mobx.html).

Let's create a file [`www/src/models/TodoListStore.ts`](/todolist/www/src/models/TodoListStore.ts) and paste the following code:

```typescript
import { SimpleCRUDStore } from "rma-baseapp";
import { makeObservable, action } from "mobx";

export interface Todo {
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
  }
}
```

In the above code, we create an interface `Todo` matched with the definition in our database schema. Since we didn't provide custom deserializer, the fields in our frontend is matched exactly with the fields in our database in the backend. Then, we define a store `TodoListStore` extending the `SimpleCRUDStore` from our frontend library `rma-baseapp`. This gives us several useful functions out of the box such as `create`, `delete`, `update`, and `query` the records from the server. We also define an additional function that will toggle the `checked` value of an `Todo` to show how to extend the store if needed.

To use the stores with [React Hooks](https://reactjs.org/docs/hooks-intro.html), we need to following code in [`www/src/models/index.ts`](/todolist/www/src/models/index.ts)

```typescript
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
```

#### Routing & Application

Routing specifies which component the application should render for a particular URL. This makes it much easier to keep the application logic separated especially when you have lots of pages. Our frontend library enables us to define all the routing in a single place with strong type annotation, so that it's easier to maintain the application's routing and is harder to make mistake.

Let's create a file `www/routes.tsx` and define our first route:

```typescript
import { NoArgsPathDef } from "rma-baseapp";
import { HomePage } from "./pages/HomePage";

export const routes = {
  home: new NoArgsPathDef({
    component: HomePage,
    pathDef: "/",
    exact: true,
  }),
};
```

In this route, we say when user open `/`, we will render a component [`HomePage`](/todolist/www/src/pages/HomePage.tsx). For now, let's just use a dummy `HomePage` for now:

```typescript
export const HomePage = () => {
  return <p>Hello world</p>;
};
```

With the specified routes and a dummy `HomePage` component, the final piece is to render and attach our component to the DOM. In [`index.tsx`](/todolist/www/src/index.tsx):

```typescript
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
```

`StoreContext.Provider` component enables us to use `useStores` hook we defined earlier in any component, and `App` component will render the component that matched with the current URL as specified in our routes.

#### Create TodoList component

It's now time to complete our [`HomePage`](/todolist/www/src/pages/HomePage.tsx) component to show the TodoList.

We first use the stores within the component and wrapped it with `observer` so that it will react whenever the state changes

```typescript
import { observer } from "mobx-react";

export const HomePage = observer(() => {
  const { todolistStore } = useStores();
  ...
});
```

We are going to display the todo list as a list. So we use [List component](https://ant.design/components/list).

```typescript
export const HomePage = observer(() => {
  const { todolistStore } = useStores();
  useEffect(() => {
    todolistStore.fetch({ limit: 1000, offset: 0 });
  }, []);

  const items = todolistStore.list.map((item) => {
    return (
      <List.Item key={item.id}>
        <Checkbox
          checked={item.checked}
          onChange={(e) => {
            item.checked = e.target.checked;
            todolistStore.update(item);
          }}
        >
          <Typography.Paragraph
            style={{ marginBottom: 0 }}
            editable={{
              onChange: (text) => {
                item.todo = text;
                todolistStore.update(item);
              },
            }}
          >
            {item.todo}
          </Typography.Paragraph>
        </Checkbox>
        <Button
          type="primary"
          danger={true}
          onClick={() => {
            todolistStore.delete(item.id);
          }}
        >
          Delete
        </Button>
      </List.Item>
    );
  });

  const addItem = () => todolistStore.create({ checked: false, todo: "" });

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <List bordered={true}>{items}</List>
      <Button type="primary" onClick={addItem}>
        Add
      </Button>
    </Space>
  );
});
```

Now, we are able to display the list of todo items from the database, and check/uncheck item that is done. We can extend the UI to add other functionalities such as add, delete, or update the content of todo items. You can check out the complete code in [here](/todolist/www/src/pages/HomePage.tsx).
