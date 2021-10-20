from collections import defaultdict
import re
from functools import partial
from typing import Type, Callable, Any, List, Optional

from flask import Blueprint, request, jsonify
from peewee import Model as PeeweeModel, DoesNotExist, fn
from playhouse.shortcuts import model_to_dict
from werkzeug.exceptions import BadRequest, NotFound


def generate_api(
    Model: Type[PeeweeModel],
    serialize: Optional[Callable[[Any], dict]] = None,
    batch_serialize: Optional[Callable[[List[Any]], List[dict]]] = None,
):
    name2field = {name: field for name, field in Model._meta.fields.items()}
    op_fields = {"fields", "limit", "offset", "unique", "sorted_by"}
    norm_value = {name: field.db_value for name, field in Model._meta.fields.items()}

    table_name = Model._meta.table_name
    default_limit = str(50)

    if serialize is None:
        if hasattr(Model, "to_dict"):
            serialize = Model.to_dict
        else:
            serialize = partial(model_to_dict, recurse=False)

    if batch_serialize is None:
        batch_serialize = lambda lst: [serialize(item) for item in lst]

    assert len(op_fields.intersection(name2field.keys())) == 0

    bp = Blueprint(table_name, table_name)

    @bp.route(f"/{table_name}", methods=["GET"])
    def get():
        """Retrieving records matched a query.
        Condition on a field such as >, >=, <, <= can be specified using brackets such as: <field>[gt]=10.
        We also support complex conditions:
            1. `max`: keep the record in a group that 
        """
        if "fields" in request.args:
            field_names = request.args["fields"].split(",")
            fields = [name2field[name] for name in field_names]
        else:
            field_names = []
            fields = []
        limit = int(request.args.get("limit", default_limit))
        offset = int(request.args.get("offset", "0"))
        unique = request.args.get("unique", "false") == "true"
        order_by = []
        if "sorted_by" in request.args:
            for field in request.args['sorted_by'].split(","):
                if field.startswith("-"):
                    order_by.append(name2field[field[1:]].desc())
                else:
                    order_by.append(name2field[field])

        reg = re.compile(r"(?P<name>[a-zA-Z_0-9]+)(?:\[(?P<op>[a-zA-Z0-9]+)\])?")
        query = Model.select(*fields)

        filter_fields = defaultdict(list)
        for name, value in request.args.items():
            if name in op_fields:
                continue
            m = reg.match(name)
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
                                raise BadRequest(f"Does not support nested special operators")
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

        if unique:
            query = query.distinct()

        if limit == 1:
            # they want to fetch only one item so we can save computation
            # by not calculating how many items match
            total = 1
        else:
            total = query.count()

        query = query.limit(limit).offset(offset)
        if len(order_by) > 0:
            query = query.order_by(*order_by)

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

    return bp
