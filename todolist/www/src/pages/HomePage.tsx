import { useEffect } from "react";
import { Col, Checkbox, Row, List, Button } from "antd";
import { useStores } from "../models";
import { observer } from "mobx-react";

export const HomePage = observer(() => {
  const { todolistStore } = useStores();
  useEffect(() => {
    todolistStore.fetchSome({ limit: 1000, offset: 0 });
  }, []);

  const items = todolistStore.list.map((item) => {
    return (
      <List.Item key={item.id}>
        <Checkbox
          checked={item.checked}
          onChange={() => {
            todolistStore.toggle(item);
          }}
        >
          {item.todo}
        </Checkbox>{" "}
      </List.Item>
    );
  });

  return (
    <Row gutter={16}>
      <Col className="gutter-row" span={8} offset={8}>
        <List bordered={true}>{items}</List>
      </Col>
    </Row>
  );
});
