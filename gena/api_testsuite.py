from typing import List, Tuple, Type
from flask import Flask
from flask.testing import FlaskClient
import pytest
from peewee import Model


class APITestSuite:
    @pytest.fixture
    def app(self) -> Flask:
        """Flask application"""
        raise NotImplementedError()

    @pytest.fixture
    def client(self, app: Flask) -> FlaskClient:
        """A test client returned by the Flask application"""
        return app.test_client()

    @pytest.fixture(scope="session")
    def model(self) -> Type[Model]:
        """Return the peewee model representing a database table holding the API resources"""
        raise NotImplementedError()

    @pytest.fixture(scope="session")
    def existed_resources(self) -> List[Tuple[Model, dict]]:
        """Return a list of resources that already exist in the database (does not have to be exhaustive)"""
        raise NotImplementedError()

    def test_get(
        self,
        client: FlaskClient,
        model: Type[Model],
        existed_resources: List[Tuple[Model, dict]],
    ):
        # test getting the existed resources.
        # Note: the existed resources must be within top 100
        result = client.get(
            self.get_api_prefix(model), query_string={"limit": 100, "offset": 0}
        )

        returned_resources = {x["id"]: x for x in result.json["items"]}

        for resource, resource_json in existed_resources:
            rid = resource.id
            assert rid in returned_resources
            assert returned_resources[rid] == resource_json

    def get_api_prefix(self, model: Type[Model]) -> str:
        return f"/api/{model._meta.table_name}"
