import requests
from typing import Type, Union

from peewee import Model as PeeweeModel, DoesNotExist, fn
from loguru import logger

ID = Union[str, int]


class Client:
    """Client to communicate with the API"""

    def __init__(self, endpoint: str) -> None:
        self.endpoint = endpoint

    def create(self, record: dict):
        record = self.filter_none(record)
        assert "id" not in record
        resp = requests.post(f"{self.endpoint}", json=record)
        self.assert_resp(resp)
        return resp.json()

    def upsert(self, record: dict):
        record = self.filter_none(record)

        if "id" in record:
            self.update(record)
            return record

        resp = requests.get(self.endpoint, params=record)
        self.assert_resp(resp)
        items = resp.json()["items"]
        if len(items) == 0:
            # not found, we create it
            resp = requests.post(self.endpoint, json=record)
            self.assert_resp(resp)
            record = resp.json()
        else:
            assert len(items) == 1, "Upsert should only affect one record"
            record = items[0]

        return record

    def update(self, record: dict):
        resp = requests.put(
            f"{self.endpoint}/{record['id']}", json=self.filter_none(record)
        )
        self.assert_resp(resp)
        return resp.json()

    def has(self, record_or_id: Union[dict, ID]):
        if (
            not isinstance(record_or_id, dict)
            or record_or_id.get("id", None) is not None
        ):
            id = record_or_id["id"] if isinstance(record_or_id, dict) else record_or_id

            resp = requests.head(f"{self.endpoint}/{id}")
            if resp.status_code == 404:
                return False
            self.assert_resp(resp)
            return True

        record = self.filter_none(record_or_id)
        resp = requests.get(f"{self.endpoint}", params=record)
        self.assert_resp(resp)
        return len(resp.json()["items"]) > 0

    def get(self, queries: dict):
        resp = requests.get(f"{self.endpoint}", params=queries)
        self.assert_resp(resp)
        return resp.json()["items"]

    def get_one(self, queries: dict):
        items = self.get(queries)
        if len(items) == 0:
            raise Exception("No item found")
        assert len(items) == 1, items
        return items[0]

    def get_by_id(self, id: str):
        resp = requests.get(f"{self.endpoint}/{id}")
        self.assert_resp(resp)
        return resp.json()

    def delete(self, record_or_id: Union[dict, ID]):
        if (
            not isinstance(record_or_id, dict)
            or record_or_id.get("id", None) is not None
        ):
            id = record_or_id["id"] if isinstance(record_or_id, dict) else record_or_id
            resp = requests.delete(f"{self.endpoint}/{id}")
            self.assert_resp(resp)
        else:
            raise NotImplementedError("The function does not support on server as well")

    def filter_none(self, record: dict):
        return {k: v for k, v in record.items() if v is not None}

    def assert_resp(self, resp, status_code: int = 200):
        if resp.status_code != status_code:
            logger.error(f"Expect status code {status_code} but get {resp.status_code}")
            logger.error(resp.text)
            raise Exception(resp.status_code)
