from collections import defaultdict
from curses import raw
import re
from functools import partial
from typing import Mapping, Type, Callable, Any, List, Optional, Dict

from flask import Blueprint, json, request, jsonify
from flask_peewee_restful.deserializer import generate_deserializer
from peewee import Model as PeeweeModel, DoesNotExist, fn
from playhouse.shortcuts import model_to_dict
from werkzeug.exceptions import BadRequest, NotFound


def generate_api(
    Model: Type[PeeweeModel],
    deserializers: Dict[str, Callable[[Any], Any]] = None,
    serialize: Optional[Callable[[Any], dict]] = None,
    batch_serialize: Optional[Callable[[List[Any]], List[dict]]] = None,
    enable_truncate_table: bool = False,
):
    """Generate API from the given Model

    Args:
        Model: peewee model of the table
        deserializers: deserialize raw value, throw value error if value is invalid. you can provide deserializer for some field and the rest is going to be generated automatically
        serialize:
        batch_serialize:
        enable_truncate_table: whether to enable API to truncate the whole table
    """
    table_name = Model._meta.table_name
    default_limit = str(50)
    name2field = {name: field for name, field in Model._meta.fields.items()}
    op_fields = {"fields", "limit", "offset", "unique", "sorted_by", "group_by"}
    field_reg = re.compile(r"(?P<name>[a-zA-Z_0-9]+)(?:\[(?P<op>[a-zA-Z0-9]+)\])?")

    if deserializers is None:
        deserializers = generate_deserializer(Model)
    elif len(set(name2field.keys()).difference(deserializers.keys())) > 0:
        # automatically filling missing deserializers
        deserializers.update(**generate_deserializer(Model))

    if len(set(name2field.keys()).difference(deserializers.keys())) > 0:
        raise Exception(
            f"Table {table_name} doesn't have deserializer for field: {set(name2field.keys()).difference(deserializers.keys())}"
        )

    if serialize is None:
        if hasattr(Model, "to_dict"):
            serialize = Model.to_dict
        elif batch_serialize is not None:
            serialize = lambda x: batch_serialize([x])[0]
        else:
            serialize = partial(model_to_dict, recurse=False)

    if batch_serialize is None:
        assert serialize is not None
        batch_serialize = lambda lst: [serialize(item) for item in lst]

    assert len(op_fields.intersection(name2field.keys())) == 0

    bp = Blueprint(table_name, table_name)

    @bp.route(f"/{table_name}", methods=["GET"])
    def get():
        """Retrieving records matched a query.
        Condition on a field such as >, >=, <, <=, `max`, `min`, `in` can be specified using brackets such as: <field>[gt]=10.
        We also support complex conditions:
            1. `max`: keep the record in a group that has the largest value
            2. `min`: keep the record in a group that has the smallest value
            3. `in`: select record that its values are in the given list

        We can support another aggregation to select keep all values in a group. However, since each value is for each record, we also have multiple ids. Therefore, a natural choice is to use `group_by` operator instead. Note that when you use group_by, the output is still a table (not a mapping) so that the client can reuse the code that read the data, but they have to group the result themselves.

        Note that we enforce the constraint that only one aggregation (`max`, `min`, `group_by`, etc) is allow in a query to ensure the behaviour of the query is deterministic (e.g., apply a group_by and max, which one is apply first?).
        """
        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
            fields = [name2field[name] for name in field_names]
        else:
            field_names = []
            fields = []

        limit = int(request.args.get("limit", default_limit))
        offset = int(request.args.get("offset", "0"))

        # construct select clause
        query = Model.select(*fields)
        unique = request.args.get("unique", "false") == "true"
        if unique:
            query = query.distinct()

        # construct order by clause
        order_by = []
        if "sorted_by" in request.args:
            for field in request.args["sorted_by"].split(","):
                try:
                    if field.startswith("-"):
                        field = field[1:]
                        order_by.append(name2field[field].desc())
                    else:
                        order_by.append(name2field[field])
                except KeyError:
                    raise BadRequest(f"Invalid field name: {field}")

        if len(order_by) > 0:
            query = query.order_by(*order_by)

        # construct group by clause
        group_by = []
        if "group_by" in request.args:
            for field in request.args["group_by"].split(","):
                if field not in name2field:
                    raise BadRequest(f"Invalid field name: {field}")
                group_by.append(name2field[field])

        # construct where clause
        filter_fields = defaultdict(list)
        for name, value in request.args.items():
            if name in op_fields:
                continue
            m = field_reg.match(name)
            if m is None:
                raise BadRequest(f"Invalid field name: {name}")

            name = m.group("name")
            if name not in name2field:
                raise BadRequest(f"Invalid field name: {name}")

            op = m.group("op")
            filter_fields[name].append((op, value))

        pending_ops = defaultdict(dict)
        conditions = defaultdict(list)
        for name, ops in filter_fields.items():
            for op, value in ops:
                field = name2field[name]
                if op in {"max"}:
                    assert op not in pending_ops[name]
                    pending_ops[name][op] = value
                    continue
                elif op == "in":
                    deser = deserializers[name]
                    conditions[field].append(
                        (field.in_([deser(x) for x in value.split(",")]))
                    )
                    continue

                # no special operator
                value = deserializers[name](value)
                if op is None:
                    conditions[field].append((field == value))
                elif op == "gt":
                    conditions[field].append((field > value))
                elif op == "gte":
                    conditions[field].append((field >= value))
                elif op == "lt":
                    conditions[field].append((field < value))
                elif op == "lte":
                    conditions[field].append((field <= value))
                else:
                    raise BadRequest(f"Does not support {op} yet")

        if len(conditions) > 0:
            query = query.where(*[item for lst in conditions.values() for item in lst])

        if len(group_by) > 0:
            if len(pending_ops) > 0:
                raise BadRequest(f"Does not support multiple aggregations")
            # update the select to keep the id
            subquery = query.select(
                *[c.alias(f"gb_c{i}") for i, c in enumerate(group_by)]
            ).group_by(*group_by)

            predicate = group_by[0] == getattr(subquery.c, "gb_c0")
            for i, c in enumerate(group_by[1:], start=1):
                predicate = predicate & (c == getattr(subquery.c, f"gb_c{i}"))
            query = query.join(subquery.limit(limit).offset(offset), on=predicate)
            # they want to get only one record so we save computation knowing that it won't use anyway
            total = subquery.count()
        else:
            for name, ops in pending_ops.items():
                field = name2field[name]
                for op, value in ops.items():
                    if op == "max":
                        # select the record with maximum value in the group
                        # need to do a subquery to select the one with maximum value
                        subquery_group_fields = []
                        subquery_group_field_conditions = []

                        for gfield in value.split(","):
                            if gfield not in name2field:
                                raise BadRequest(f"Invalid group by field: {gfield}")
                            subquery_group_fields.append(name2field[gfield])
                            if gfield in conditions:
                                if gfield in pending_ops:
                                    raise BadRequest(
                                        f"Does not support multiple aggregations"
                                    )
                                subquery_group_field_conditions += conditions[gfield]

                        subquery_name = f"{name}_{op}"
                        field_alias = f"{subquery_name}_{name}"
                        subquery = (
                            Model.select(Model.id, fn.MAX(field).alias(field_alias))
                            .group_by(*subquery_group_fields)
                            .alias(subquery_name)
                        )

                        if len(subquery_group_field_conditions) > 0:
                            subquery = subquery.where(*subquery_group_field_conditions)

                        predicate = (Model.id == subquery.c.id) & (
                            field == getattr(subquery.c, field_alias)
                        )
                        query = query.join(subquery, on=predicate)

            # they want to get only one record so we save computation knowing that it won't use anyway
            total = query.count()
            query = query.limit(limit).offset(offset)

        # perform the query
        items = batch_serialize(list(query))
        if len(fields) > 0:
            items = [{k: item[k] for k in field_names} for item in items]

        return jsonify({"items": items, "total": total})

    @bp.route(f"/{table_name}/find_by_ids", methods=["POST"])
    def get_by_ids():
        if "ids" not in request.json:
            raise BadRequest("Bad request. Missing `ids`")

        ids = request.json["ids"]
        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
            fields = [name2field[name] for name in field_names]
        else:
            field_names = []
            fields = []

        records = list(Model.select(Model.id, *fields).where(Model.id.in_(ids)))
        records = batch_serialize(records)

        if len(field_names) > 0:
            records = {
                item["id"]: {k: item[k] for k in field_names if k in item}
                for item in records
            }

        return jsonify({"items": records, "total": len(records)})

    @bp.route(f"/{table_name}/<id>", methods=["GET"])
    def get_one(id):
        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
            fields = [name2field[name] for name in field_names]
        else:
            field_names = []
            fields = []

        records = list(Model.select(*fields).where(Model.id == id))
        if len(records) == 0:
            raise NotFound(f"Record {id} does not exist")

        record = serialize(records[0])
        if len(fields) > 0:
            record = {k: record[k] for k in field_names}

        return jsonify(record)

    @bp.route(f"/{table_name}/<id>", methods=["HEAD"])
    def has(id):
        if not Model.select().where(Model.id == id).exists():
            raise NotFound(f"Record {id} does not exist")
        return jsonify()

    @bp.route(f"/{table_name}", methods=["POST"])
    def create():
        posted_record = request.json
        raw_record = {}

        for name, field in name2field.items():
            if name in posted_record:
                try:
                    raw_record[name] = deserializers[name](posted_record[name])
                except ValueError as e:
                    raise ValueError(f"Field `{name}` {str(e)}")
        if "id" in raw_record:
            # remove id as this API always creates a new record
            raw_record.pop("id")
        record = Model.create(**raw_record)
        # TODO: correct return types according to RESTful specification https://restfulapi.net/http-methods/
        return jsonify(serialize(record))

    @bp.route(f"/{table_name}/<id>", methods=["PUT"])
    def update(id):
        try:
            record = Model.get_by_id(id)
        except DoesNotExist as e:
            raise NotFound(f"Record {id} does not exist")

        for name, field in name2field.items():
            if name in request.json:
                try:
                    value = deserializers[name](request.json[name])
                except ValueError as e:
                    raise ValueError(f"Field `{name}` {str(e)}")

                setattr(record, name, value)
        record.save()

        return jsonify(serialize(record))

    @bp.route(f"/{table_name}/<id>", methods=["DELETE"])
    def delete_by_id(id):
        try:
            Model.get_by_id(id).delete_instance()
        except DoesNotExist as e:
            raise NotFound(f"Record {id} does not exist")

        return jsonify({"status": "success"})

    if enable_truncate_table:

        @bp.route(f"/{table_name}", methods=["DELETE"])
        def truncate():
            Model.truncate_table()
            return jsonify({"status": "success"})

    return bp


def generate_readonly_api_4dict(
    name: str,
    id2ent: Mapping[str, Any],
    unique_field_funcs: Dict[str, Callable[[str], str]] = None,
    serialize: Optional[Callable[[Any], dict]] = None,
    batch_serialize: Optional[Callable[[List[Any]], List[dict]]] = None,
):
    """Generate API for a dictionary.

    Make it as similar to the API of DB as possible. However, due to its limitation, we
    only support accessing by unique key (via id or other unique field)

    Args:
        name: name of the endpoint
        id2ent: dictionary of entities
        unique_field_funcs: unique field and function to transform it to id
        serialize: function to serialize an entity
        batch_serialize: function to serialize a list of entities
    """
    op_fields = {"fields", "limit", "offset", "unique", "sorted_by"}
    if batch_serialize is None:
        assert serialize is not None
        batch_serialize = gen_batch_serialize(serialize)
    elif serialize is None:
        serialize = lambda x: batch_serialize([x])[0]

    if unique_field_funcs is None:
        unique_field_funcs = {}
    bp = Blueprint(name, name)

    @bp.route(f"/{name}", methods=["GET"])
    def get():
        """Retrieving records matched a query."""
        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
        else:
            field_names = []

        lst = []
        for name in request.args.keys():
            if name in op_fields:
                continue
            if name not in unique_field_funcs:
                raise BadRequest(f"Invalid field name: {name}")
            lst.append(name)

        if len(lst) > 1:
            raise BadRequest(f"Invalid query. Only one field is allowed but get: {lst}")

        if len(lst) == 0:
            raise BadRequest(f"Invalid query. Must provide at least one field")

        id = unique_field_funcs[lst[0]](request.args[lst[0]])
        record = serialize(id2ent[id])
        if len(field_names) > 0:
            record = {k: record[k] for k in field_names if k in record}

        return jsonify({"items": [record], "total": 1})

    @bp.route(f"/{name}/find_by_ids", methods=["POST"])
    def find_by_ids():
        if "ids" not in request.json:  # type: ignore
            raise BadRequest("Bad request. Missing `ids`")

        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
        else:
            field_names = []

        ids = []
        ents = []
        for id in request.json["ids"]:
            if id in id2ent:
                ents.append(id2ent[id])
                ids.append(id)

        records = batch_serialize(ents)
        if len(field_names) > 0:
            records = [
                {k: item[k] for k in field_names if k in item} for item in records
            ]

        return jsonify({"items": dict(zip(ids, records)), "total": len(ents)})

    @bp.route(f"/{name}/<id>", methods=["GET"])
    def find_by_id(id: str):
        if id not in id2ent:
            raise NotFound(f"Record {id} does not exist")

        record = serialize(id2ent[id])

        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
        else:
            field_names = []

        if len(field_names) > 0:
            record = {k: record[k] for k in field_names if k in record}

        return jsonify(record)

    return bp


def gen_batch_serialize(
    serialize: Callable[[Any], dict]
) -> Callable[[List[Any]], List[dict]]:
    def batch_serialize(lst):
        return [serialize(item) for item in lst]

    return batch_serialize
