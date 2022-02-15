import { Button, Checkbox, List, Space, Typography } from "antd";
import { observer } from "mobx-react";
import { useEffect } from "react";
import { useStores } from "../models";

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
