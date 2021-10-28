from collections import defaultdict
import re
from functools import partial
from typing import Type, Callable, Any, List, Optional, Dict

from flask import Blueprint, request, jsonify
from peewee import Model as PeeweeModel, DoesNotExist, fn
from playhouse.shortcuts import model_to_dict
from werkzeug.exceptions import BadRequest, NotFound


def generate_api(
    Model: Type[PeeweeModel],
    serialize: Optional[Callable[[Any], dict]] = None,
    batch_serialize: Optional[Callable[[List[Any]], List[dict]]] = None,
    enable_truncate_table: bool = False
):
    name2field = {name: field for name, field in Model._meta.fields.items()}
    op_fields = {"fields", "limit", "offset", "unique", "sorted_by", "group_by"}
    field_reg = re.compile(r"(?P<name>[a-zA-Z_0-9]+)(?:\[(?P<op>[a-zA-Z0-9]+)\])?")
    norm_value = {name: field.db_value for name, field in Model._meta.fields.items()}

    table_name = Model._meta.table_name
    default_limit = str(50)

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
        Condition on a field such as >, >=, <, <= can be specified using brackets such as: <field>[gt]=10.
        We also support complex conditions:
            1. `max`: keep the record in a group that has the largest value
            2. `min`: keep the record in a group that has the smallest value

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
            for field in request.args['sorted_by'].split(","):
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
            for field in request.args['group_by'].split(","):
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

                # no special operator
                value = norm_value[name](value)
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
            subquery = query.select(*[c.alias(f"gb_c{i}") for i, c in enumerate(group_by)]) \
                .group_by(*group_by)

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
                                    raise BadRequest(f"Does not support multiple aggregations")
                                subquery_group_field_conditions += conditions[gfield]

                        subquery_name = f"{name}_{op}"
                        field_alias = f"{subquery_name}_{name}"
                        subquery = Model.select(Model.id, fn.MAX(field).alias(field_alias)) \
                            .group_by(*subquery_group_fields) \
                            .alias(subquery_name)

                        if len(subquery_group_field_conditions) > 0:
                            subquery = subquery.where(*subquery_group_field_conditions)

                        predicate = (Model.id == subquery.c.id) & (field == getattr(subquery.c, field_alias))
                        query = query.join(subquery, on=predicate)

            # they want to get only one record so we save computation knowing that it won't use anyway
            total = query.count()
            query = query.limit(limit).offset(offset)

        # perform the query
        items = batch_serialize(query)
        if len(fields) > 0:
            items = [
                {k: item[k] for k in field_names}
                for item in items
            ]

        return jsonify({
            "items": items,
            "total": total
        })

    @bp.route(f"/{table_name}/<id>", methods=["GET"])
    def get_one(id):
        try:
            record = Model.get_by_id(id)
        except DoesNotExist as e:
            raise NotFound(f"Record {id} does not exist")

        return jsonify(serialize(record))

    if enable_truncate_table:
        @bp.route(f"/{table_name}", methods=["DELETE"])
        def truncate():
            Model.truncate_table()
            return jsonify({
                "status": "success"
            })

    return bp


def generate_api_4dict(
    name: str,
    id2ent: Dict[str, Any],
    serialize: Optional[Callable[[Any], dict]] = None,
    batch_serialize: Optional[Callable[[List[Any]], List[dict]]] = None,
):
    op_fields = {"fields", "limit", "offset", "unique", "sorted_by"}
    field_reg = re.compile(r"(?P<name>[a-zA-Z_0-9]+)(?:\[(?P<op>[a-zA-Z0-9]+)\])?")

    bp = Blueprint(name, name)

    @bp.route(f"/{name}/find_by_ids", methods=["POST"])
    def find_by_ids():
        if 'ids' not in request.json:
            raise BadRequest("Bad request. Missing `ids`")

        ids = []
        ents = []
        for id in request.json['ids']:
            if id in id2ent:
                ents.append(id)
                ids.append(id)

        return jsonify({
            "items": dict(zip(ids, batch_serialize(ents))),
            "total": len(ents)
        })

    @bp.route(f"/{name}/<id>", methods=["GET"])
    def get_one(id: str):
        if id not in id2ent:
            raise NotFound(f"Record {id} does not exist")
        return jsonify(serialize(id2ent[id]))

    return bp
