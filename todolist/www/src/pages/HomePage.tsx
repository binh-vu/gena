import { Button, Checkbox, Col, List, Row, Space, Typography } from "antd";
import { observer } from "mobx-react";
import { useEffect } from "react";
import {
  SimpleDraftCreateRecord,
  SimpleDraftUpdateRecord,
} from "rma-baseapp/lib/esm/models/Record";
import { Todo, useStores } from "../models";

export const HomePage = observer(() => {
  const { todolistStore } = useStores();
  useEffect(() => {
    todolistStore.fetch({ limit: 1000, offset: 0 });
  }, []);

  const items = todolistStore.list.map((item) => <TodoItem item={item} />);

  const addItem = () => {
    todolistStore.create(
      new SimpleDraftCreateRecord("", {
        id: 0,
        checked: false,
        todo: "",
      })
    );
  };

  return (
    <Row gutter={16}>
      <Col className="gutter-row" span={8} offset={8}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <List bordered={true}>{items}</List>
          <Button type="primary" onClick={addItem}>
            Add
          </Button>
        </Space>
      </Col>
    </Row>
  );
});

const TodoItem = observer(({ item }: { item: Todo }) => {
  const { todolistStore } = useStores();
  return (
    <List.Item key={item.id}>
      <Checkbox
        checked={item.checked}
        onChange={() => todolistStore.toggle(item)}
      >
        <Typography.Paragraph
          style={{ marginBottom: 0 }}
          editable={{
            tooltip: "click to edit text",
            onChange: (text) => {
              item.todo = text;
              todolistStore.update(new SimpleDraftUpdateRecord(item));
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
