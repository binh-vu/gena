from enum import Enum
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Set,
    Type,
    Union,
    get_args,
    get_origin,
    get_type_hints,
    _TypedDictMeta,  # type: ignore
)
from gena.custom_fields import (
    DataClassField,
    Dict2ListDataClassField,
    DictDataClassField,
    ListDataClassField,
)
from peewee import (
    CharField,
    Model,
    Field,
    FloatField,
    ForeignKeyField,
    IntegerField,
    BooleanField,
    _StringField,
    TextField,
    Value,
)
from dataclasses import MISSING, fields, is_dataclass


class NoDerivedDeserializer(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.error_trace = []

    def get_root_field(self):
        return self.error_trace[-1]

    def add_trace(self, *parents: str):
        self.error_trace.extend(reversed(parents))
        return self

    def __str__(self) -> str:
        return f"cannot derive deserializer for: {list(reversed(self.error_trace))}"


Deserializer = Callable[[Any], Any]


def generate_deserializer(
    Model: Type[Model],
    known_type_deserializers: Optional[Dict[Any, Deserializer]] = None,
    known_field_deserializers: Optional[Set[str]] = None,
) -> Dict[str, Deserializer]:
    known_type_deserializers = known_type_deserializers or {}
    known_field_deserializers = known_field_deserializers or set()

    fields = Model._meta.fields
    field_type_hints = get_type_hints(Model)

    output = {}
    for name, field in fields.items():
        if name in known_field_deserializers:
            continue

        if isinstance(field, IntegerField):
            func = deserialize_int
        elif isinstance(field, FloatField):
            func = deserialize_float
        elif isinstance(field, BooleanField):
            func = deserialize_bool
        elif isinstance(field, _StringField):
            if isinstance(field, CharField) or type(field) is TextField:
                if (
                    name in field_type_hints
                    and get_origin(field_type_hints[name]) is Literal
                ):
                    func = get_deserializer_from_type(
                        field_type_hints[name], known_type_deserializers
                    )
                else:
                    func = deserialize_str
            else:
                # a catch here, JSONField is a subclass of _StringField & TextField
                # so we check if its type hint
                if name not in field_type_hints:
                    raise Exception(
                        f"Column {name} is not annotated or not a class variable. But we need its annotation because the field does not seems to be a string field"
                    )
                elif field_type_hints[name] is not str:
                    func = get_deserializer_from_type(
                        field_type_hints[name], known_type_deserializers
                    )
                else:
                    func = deserialize_str
        elif isinstance(field, ForeignKeyField):
            if field.field_type.upper() == "INT":
                func = deserialize_int
            else:
                raise NoDerivedDeserializer().add_trace(Model.__qualname__, name)
            output[f"{name}_id"] = func
        elif isinstance(field, DataClassField):
            func = get_dataclass_deserializer(field.CLS, known_type_deserializers)
            if type(field) is ListDataClassField:
                func = get_deserialize_list(func)
            elif type(field) is DictDataClassField:
                func = get_deserialize_dict(func)
            elif type(field) is Dict2ListDataClassField:
                func = get_deserialize_dict(get_deserialize_list(func))
        else:
            raise NoDerivedDeserializer().add_trace(Model.__qualname__, name)

        if field.null:
            func = get_deserialize_nullable(func)
        output[name] = func
    return output


def deserialize_int(value):
    if isinstance(value, int):
        return value

    if isinstance(value, str):
        return int(value)

    if isinstance(value, float):
        if value == int(value):
            return int(value)

    raise ValueError(f"expect integer but get: {type(value)}")


def deserialize_bool(value):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        if value != "true" and value != "false":
            raise ValueError(f"expect bool string but get: {value}")
        return value == "true"

    raise ValueError(f"expect bool value but get: {type(value)}")


def deserialize_str(value):
    if isinstance(value, str):
        return value
    raise ValueError(f"expect string but get: {type(value)}")


def deserialize_float(value):
    if isinstance(value, (int, float)):
        return value

    if isinstance(value, str):
        return float(value)

    raise ValueError(f"expect float but get: {type(value)}")


def deserialize_number_or_string(value):
    if not isinstance(value, (int, str, float)):
        raise ValueError(f"expect either string or number but get {type(value)}")
    return value


def deserialize_none(value):
    if value is not None:
        raise ValueError(f"expect none but get {type(value)}")
    return value


def get_deserialize_nullable(deserialize_item: Deserializer):
    def deserialize_nullable(value):
        if value is None:
            return None
        return deserialize_item(value)

    return deserialize_nullable


def get_deserialize_list(deserialize_item: Deserializer):
    def deserialize_list(value):
        if not isinstance(value, list):
            raise ValueError(f"expect list but get {type(value)}")
        return [deserialize_item(item) for item in value]

    return deserialize_list


def get_deserialize_tuple(deserialize_items: list[Deserializer]):
    def deserialize_tuple(value):
        if not isinstance(value, list):
            raise ValueError(f"expect list but get {type(value)}")
        if len(value) != len(deserialize_items):
            raise ValueError(
                f"expect list of length {len(deserialize_items)} but get {len(value)}"
            )
        return tuple(deser(item) for deser, item in zip(deserialize_items, value))

    return deserialize_tuple


def get_deserialize_homogeneous_tuple(deserialize_item: Deserializer):
    def deserialize_tuple(value):
        if not isinstance(value, (list, tuple)):
            raise ValueError(f"expect list/tuple but get {type(value)}")
        return tuple(deserialize_item(item) for item in value)

    return deserialize_tuple


def get_deserialize_set(deserialize_item: Deserializer):
    def deserialize_set(value):
        if not isinstance(value, set):
            raise ValueError(f"expect set but get {type(value)}")
        return {deserialize_item(item) for item in value}

    return deserialize_set


def get_deserialize_dict(deserialize_key: Deserializer, deserialize_item: Deserializer):
    def deserialize_dict(value):
        if not isinstance(value, dict):
            raise ValueError(f"expect dict but get {type(value)}")
        return {deserialize_key(k): deserialize_item(item) for k, item in value.items()}

    return deserialize_dict


def get_deserializer_from_type(
    annotated_type, known_type_deserializers: Dict[Any, Deserializer]
) -> Deserializer:
    if annotated_type in known_type_deserializers:
        return known_type_deserializers[annotated_type]
    if annotated_type is str:
        return deserialize_str
    if annotated_type is int:
        return deserialize_int
    if annotated_type is float:
        return deserialize_float
    if annotated_type is bool:
        return deserialize_bool
    if annotated_type is type(None):
        return deserialize_none
    if is_dataclass(annotated_type):
        return get_dataclass_deserializer(annotated_type, known_type_deserializers)
    if isinstance(annotated_type, _TypedDictMeta):
        # is_typeddict is not supported at python 3.8 yet
        return get_typeddict_deserializer(annotated_type, known_type_deserializers)
    try:
        if issubclass(annotated_type, Enum):
            # enum can be reconstructed using its constructor.
            return annotated_type
    except TypeError:
        pass

    args = get_args(annotated_type)
    origin = get_origin(annotated_type)

    if origin is None or len(args) == 0:
        # we can't handle this type, e.g., some class that are not dataclass, or simply just list or set (not enough information)
        raise NoDerivedDeserializer().add_trace(annotated_type)

    # handle literal first
    if origin is Literal:
        assert all(
            isinstance(arg, (str, int, float)) for arg in args
        ), f"Invalid literals: {args}"
        valid_values = set(args)

        def deserialize_literal(value):
            if value not in valid_values:
                raise Exception(f"expect one of {valid_values} but get {value}")
            return value

        return deserialize_literal

    # handle a special case of variable-length tuple of homogeneous type
    # https://docs.python.org/3/library/typing.html#typing.Tuple
    if origin is tuple and len(args) > 1 and args[-1] is Ellipsis:
        if len(args) != 2:
            raise Exception(
                "invalid annotation of variable-length tuple of homogeneous type. expect one type and ellipsis"
            )
        return get_deserialize_homogeneous_tuple(
            get_deserializer_from_type(args[0], known_type_deserializers)
        )

    arg_desers = [
        get_deserializer_from_type(arg, known_type_deserializers) for arg in args
    ]
    if any(fn is None for fn in arg_desers):
        raise NoDerivedDeserializer().add_trace(
            annotated_type,
            next((arg for fn, arg in zip(arg_desers, args) if fn is None)),
        )

    deserialize_args: Deserializer
    if len(arg_desers) == 1:
        deserialize_args = arg_desers[0]  # type: ignore
    elif len(arg_desers) == 2 and type(None) in args:
        # handle special case of none
        not_none_arg_deser = [
            arg_desers[i] for i, arg in enumerate(args) if arg is not type(None)
        ][0]

        def deserialize_optional_arg(value):
            if value is None:
                return value
            return not_none_arg_deser(value)  # type: ignore

        deserialize_args = deserialize_optional_arg
    else:
        # TODO: we can optimize this further
        def deserialize_n_args(value):
            for arg_deser in arg_desers:
                try:
                    return arg_deser(value)  # type: ignore
                except ValueError:
                    pass
            raise ValueError(
                f"Expect one of the type: {''.join(str(arg) for arg in args)} but get {value}"
            )

        deserialize_args = deserialize_n_args

    if origin is tuple:
        return get_deserialize_tuple(arg_desers)

    if origin is list:
        return get_deserialize_list(deserialize_args)

    if origin is set:
        return get_deserialize_set(deserialize_args)

    if origin is dict:
        return get_deserialize_dict(arg_desers[0], arg_desers[1])

    if origin is Union:
        return deserialize_args

    # do we exhaust the list of built-in types?
    raise NoDerivedDeserializer().add_trace(annotated_type)


def get_typeddict_deserializer(
    typeddict: _TypedDictMeta, known_type_deserializers: Dict[str, Deserializer]
) -> Deserializer:
    total = typeddict.__total__
    if not total:
        # they can inject any key as the semantic of total
        raise NoDerivedDeserializer().add_trace(
            typeddict.__name__, "is not a total TypedDict"
        )

    field2deserializer = {}

    def deserialize_typed_dict(value):
        if not isinstance(value, dict):
            raise ValueError("expect dictionary but get {value}")
        output = {}
        for field, func in field2deserializer.items():
            if field not in value:
                raise ValueError(f"expect field {field} but it's missing")
            output[field] = func(value[field])
        return output

    # assign first to support recursive type in the field
    known_type_deserializers[typeddict] = deserialize_typed_dict

    for field, field_type in typeddict.__annotations__.items():
        try:
            func = get_deserializer_from_type(field_type, known_type_deserializers)
        except NoDerivedDeserializer as e:
            del known_type_deserializers[typeddict]
            raise e.add_trace(field)
        field2deserializer[field] = func

    return deserialize_typed_dict


def get_dataclass_deserializer(
    CLS,
    known_type_deserializers: Optional[Dict[Any, Deserializer]] = None,
    known_field_deserializers: Optional[Dict[str, Deserializer]] = None,
) -> Deserializer:
    # extract deserialize for each field
    field2deserializer: Dict[str, Deserializer] = {}
    field2optional: Dict[str, bool] = {}
    field_types = get_type_hints(CLS)

    def deserialize_dataclass(value):
        if not isinstance(value, dict):
            raise ValueError(f"expect dictionary but get {value}")

        output = {}
        for field, deserialize in field2deserializer.items():
            if field in value:
                output[field] = deserialize(value[field])
            elif not field2optional[field]:
                # not optional field but missing
                raise ValueError(f"expect the field {field} but it's missing")
        return CLS(**output)

    # assign first to support recursive type in the field
    known_type_deserializers = known_type_deserializers or {}
    known_type_deserializers[CLS] = deserialize_dataclass
    known_field_deserializers = known_field_deserializers or {}

    for field in fields(CLS):
        if field.name in known_field_deserializers:
            field2deserializer[field.name] = known_field_deserializers[field.name]
            field2optional[field.name] = (
                field.default is not MISSING or field.default_factory is not MISSING
            )
            continue
        field_type = field_types[field.name]
        try:
            func = get_deserializer_from_type(field_type, known_type_deserializers)
        except NoDerivedDeserializer as e:
            # can't automatically figure out its child deserializer
            del known_type_deserializers[CLS]
            raise e.add_trace(CLS.__qualname__, field.name)

        field2deserializer[field.name] = func
        field2optional[field.name] = (
            field.default is not MISSING or field.default_factory is not MISSING
        )

    return deserialize_dataclass


def deserialize_dict(value):
    """Deserialize a dictionary. Avoid using it because it does not deep check as other functions"""
    if not isinstance(value, dict):
        raise ValueError(f"expect dictionary but get {type(value)}")
    return value
