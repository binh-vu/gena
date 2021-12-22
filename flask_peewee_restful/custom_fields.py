import orjson
from abc import ABC, abstractclassmethod, abstractstaticmethod
from typing import List, Optional, Type
from peewee import Field
from dataclasses import astuple, dataclass, fields


class DataClassField(Field):
    field_type = "BLOB"

    def __init__(self, CLS: Type[object], **kwargs):
        super().__init__(**kwargs)
        self.CLS = CLS
        if hasattr(CLS, "from_tuple"):
            self.from_tuple = getattr(CLS, "from_tuple")
        else:
            self.from_tuple = lambda x: CLS(*x)  # type: ignore

    def db_value(self, value):
        return orjson.dumps(astuple(value))

    def python_value(self, value):
        if value == b"null":
            return None
        value = orjson.loads(value)
        return self.from_tuple(value)


class ListDataClassField(DataClassField):
    def db_value(self, value):
        return orjson.dumps([astuple(item) for item in value])

    def python_value(self, value):
        if value == b"null":
            return None

        value = orjson.loads(value)
        return [self.from_tuple(item) for item in value]


class DictDataClassField(DataClassField):
    def db_value(self, value):
        return orjson.dumps({k: astuple(item) for k, item in value.items()})

    def python_value(self, value):
        if value == b"null":
            return None

        value = orjson.loads(value)
        return {k: self.from_tuple(item) for k, item in value.items()}


class Dict2ListDataClassField(DataClassField):
    def db_value(self, value):
        try:
            return orjson.dumps(
                {k: [astuple(item) for item in lst] for k, lst in value.items()}
            )
        except:
            print(value)
            raise

    def python_value(self, value):
        if value == b"null":
            return None

        value = orjson.loads(value)
        return {k: [self.from_tuple(item) for item in lst] for k, lst in value.items()}
