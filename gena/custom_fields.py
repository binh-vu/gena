from __future__ import annotations
import orjson
from typing import Type
from peewee import Field
from dataclasses import astuple


# db_null = b"null"
db_null = None


class DataClassField(Field):
    field_type = "BLOB"

    def __init__(self, CLS: Type[object], **kwargs):
        super().__init__(**kwargs)
        self.CLS = CLS
        if hasattr(CLS, "from_tuple"):
            self.from_tuple = getattr(CLS, "from_tuple")
        else:
            self.from_tuple = lambda x: CLS(*x)  # type: ignore

        if hasattr(CLS, "to_tuple"):
            self.to_tuple = getattr(CLS, "to_tuple")
        else:
            self.to_tuple = astuple

    def db_value(self, value):
        if value is None:
            return value
        return orjson.dumps(self.to_tuple(value), option=orjson.OPT_NON_STR_KEYS)

    def python_value(self, value):
        if value == db_null:
            return None
        value = orjson.loads(value)
        return self.from_tuple(value)


class ListDataClassField(DataClassField):
    def db_value(self, value):
        return orjson.dumps(
            [self.to_tuple(item) for item in value], option=orjson.OPT_NON_STR_KEYS
        )

    def python_value(self, value):
        if value == db_null:
            return None

        value = orjson.loads(value)
        return [self.from_tuple(item) for item in value]


class DictDataClassField(DataClassField):
    def db_value(self, value):
        return orjson.dumps(
            {k: self.to_tuple(item) for k, item in value.items()},
            option=orjson.OPT_NON_STR_KEYS,
        )

    def python_value(self, value):
        if value == db_null:
            return None

        value = orjson.loads(value)
        return {k: self.from_tuple(item) for k, item in value.items()}


class Dict2ListDataClassField(DataClassField):
    def db_value(self, value):
        try:
            return orjson.dumps(
                {k: [self.to_tuple(item) for item in lst] for k, lst in value.items()},
                option=orjson.OPT_NON_STR_KEYS,
            )
        except:
            print(value)
            raise

    def python_value(self, value):
        if value == db_null:
            return None

        value = orjson.loads(value)
        return {k: [self.from_tuple(item) for item in lst] for k, lst in value.items()}
