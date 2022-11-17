from dataclasses import fields, is_dataclass
from datetime import datetime
from enum import Enum
from operator import attrgetter
from typing import _TypedDictMeta  # type: ignore
from typing import (
    Any,
    Callable,
    Dict,
    Literal,
    Optional,
    Set,
    Type,
    Union,
    get_args,
    get_origin,
    get_type_hints,
)

from gena.config import GenaConfig
from gena.custom_fields import (
    DataClassField,
    Dict2ListDataClassField,
    DictDataClassField,
    ListDataClassField,
)
from gena.deserializer import get_deserialize_dict
from loguru import logger
from peewee import (
    BooleanField,
    DateField,
    DateTimeField,
    FloatField,
    ForeignKeyField,
    IntegerField,
    Model,
    TimestampField,
    _StringField,
)


class NoDerivedSerializer(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.error_trace = []

    def add_trace(self, *parents: str):
        self.error_trace.extend(reversed(parents))
        return self

    def __str__(self) -> str:
        return f"cannot derive serializer for: {list(reversed(self.error_trace))}"


def datetime_serializer(value: Optional[datetime]):
    # return the number of milliseconds since the UNIX epoch
    if value is None:
        return None
    return round(value.timestamp() * 1000)


Serializer = Callable[[Any], Any]
default_known_type_serializer = {
    datetime: datetime_serializer,
}
NoneType = type(None)
genaconfig = GenaConfig.get_instance()


def get_peewee_serializer(
    Model: Type[Model],
    known_type_serializer: Optional[Dict[Any, Serializer]] = None,
    exclude_fields: Optional[Set[str]] = None,
) -> Callable[[Model], dict]:
    known_type_serializer = known_type_serializer or {}
    exclude_fields = exclude_fields or set()
    fields = Model._meta.fields

    for k, v in default_known_type_serializer.items():
        if k not in known_type_serializer:
            known_type_serializer[k] = v

    field2func = {}
    foreign_keys = []
    for name, field in fields.items():
        if name in exclude_fields:
            continue

        func = None
        if isinstance(
            field,
            (IntegerField, FloatField, BooleanField, _StringField),
        ):
            # event if it is JSON, we keep the raw value (which is dictionary -- python value)
            func = None
        elif isinstance(field, ForeignKeyField):
            # handle foreign key separately to avoid extra query whenever we use the
            # proxy object
            if genaconfig.SERIALIZE_FOREIGN_KEY_FIELD_NAME == "db_field":
                foreign_keys.append([f"{name}_id", f"{name}_id"])
            else:
                foreign_keys.append([name, f"{name}_id"])
            continue
        elif isinstance(field, DataClassField):
            try:
                func = get_dataclass_serializer(field.CLS, known_type_serializer)
            except NoDerivedSerializer as e:
                raise e.add_trace(Model.__qualname__, name)

            if type(field) is ListDataClassField:
                func = get_serialize_sequence(func)
            elif type(field) is DictDataClassField:
                func = get_serialize_dict(func)
            elif type(field) is Dict2ListDataClassField:
                func = get_serialize_dict(get_serialize_sequence(func))
        elif isinstance(field, (DateTimeField, DateField, TimestampField)):
            func = datetime_serializer
        else:
            logger.warning(
                "Generate serializer for model {}, but do not know how to serialize field {} yet. Using the default db_value from peewee",
                Model,
                name,
            )
            func = field.db_value
        field2func[name] = func

    def serialize_model(record: Model) -> dict:
        output = {}
        for name, func in field2func.items():
            value = getattr(record, name)
            if func is not None:
                output[name] = func(value)
            else:
                output[name] = value
        for name, name2 in foreign_keys:
            output[name] = getattr(record, name2)
        return output

    return serialize_model


def get_serializer_from_type(
    annotated_type, known_type_serializer: Dict[str, Serializer]
) -> Optional[Serializer]:
    if annotated_type in known_type_serializer:
        return known_type_serializer[annotated_type]
    if annotated_type in (str, int, float, bool, NoneType):
        return None
    if is_dataclass(annotated_type):
        return get_dataclass_serializer(annotated_type, known_type_serializer)
    if isinstance(annotated_type, _TypedDictMeta):
        # is_typeddict is not supported at python 3.8 yet
        return get_typeddict_serializer(annotated_type, known_type_serializer)

    try:
        if issubclass(annotated_type, Enum):
            return attrgetter("value")
    except TypeError:
        pass

    origin = get_origin(annotated_type)
    args = get_args(annotated_type)

    if origin is None or len(args) == 0:
        # we can't handle this type, e.g., some class that are not dataclass, or simply just list or set (not enough information)
        raise NoDerivedSerializer().add_trace(annotated_type)

    # handle literal first
    if origin is Literal:
        return None

    if (
        origin is list
        or origin is set
        or (origin is tuple and len(args) == 2 and args[1] is Ellipsis)
    ):
        ser_arg = get_serializer_from_type(args[0], known_type_serializer)
        if ser_arg is None:
            return None
        return get_serialize_sequence(ser_arg)

    if origin is dict:
        ser_value = get_serializer_from_type(args[1], known_type_serializer)
        if ser_value is None:
            return None
        return get_serialize_dict(ser_value)

    if origin is Union:
        return get_serialize_union(
            classes=args,
            serializers=[
                get_serializer_from_type(arg, known_type_serializer) for arg in args
            ],
        )

    raise NoDerivedSerializer().add_trace(annotated_type)


def get_dataclass_serializer(
    CLS, known_type_serializer: Dict[str, Serializer]
) -> Serializer:
    field2serializer: Dict[str, Optional[Serializer]] = {}
    field_types = get_type_hints(CLS)

    def serialize_dataclass(obj):
        if obj is None:
            return None

        output = {}
        for field, serializer in field2serializer.items():
            value = getattr(obj, field)
            if serializer is None:
                output[field] = value
            else:
                output[field] = serializer(value)
        return output

    # assign first to support recursive type in the field
    known_type_serializer[CLS] = serialize_dataclass

    for field in fields(CLS):
        field_type = field_types[field.name]
        try:
            func = get_serializer_from_type(field_type, known_type_serializer)
        except NoDerivedSerializer as e:
            # can't automatically figure out how to serialize this field
            del known_type_serializer[CLS]
            raise e.add_trace(CLS.__qualname__, field.name)

        field2serializer[field.name] = func

    return serialize_dataclass


def get_typeddict_serializer(
    typeddict: _TypedDictMeta, known_type_serializer: Dict[str, Serializer]
) -> Serializer:
    total = typeddict.__total__
    if not total:
        # they can inject any key as the semantic of total, so we do not have serializer for this.
        raise NoDerivedSerializer().add_trace(
            typeddict.__name__, "is not a total TypedDict"
        )

    field2deserializer = {}

    def serialize_typeddict(value):
        if value is None:
            return None

        output = {}
        for field, deserializer in field2deserializer.items():
            value = getattr(typeddict, field)
            if deserializer is None:
                output[field] = value
            else:
                output[field] = deserializer(value)
        return output

    known_type_serializer[typeddict] = serialize_typeddict

    for field, field_type in typeddict.__annotations__.items():
        try:
            func = get_serializer_from_type(field_type, known_type_serializer)
        except NoDerivedSerializer as e:
            raise e.add_trace(field)
        field2deserializer[field] = func

    return serialize_typeddict


def get_serialize_sequence(serializer):
    def serialize_list(value):
        if value is None:
            return None
        return [serializer(item) for item in value]

    return serialize_list


def get_serialize_dict(serializer):
    def serialize_dict(value):
        if value is None:
            return None
        return {key: serializer(item) for key, item in value.items()}

    return serialize_dict


def get_serialize_union(classes, serializers):
    if all(ser is None for ser in serializers):
        return None

    def serialize_union(value):
        if value is None:
            return None
        for cls, serializer in zip(classes, serializers):
            try:
                if isinstance(value, cls):
                    return serializer(value)
            except:
                raise
        raise ValueError(
            f"Cannot serialize {value} which is not instance of one of {classes}"
        )

    return serialize_union
