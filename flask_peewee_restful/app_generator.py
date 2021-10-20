import importlib
import logging
import os
import pkgutil
from modulefinder import Module
from pathlib import Path
from typing import Union, List

from flask import Flask, render_template, Blueprint


def generate_app(
    controllers: Union[List[Blueprint], Module], pkg_dir: Union[str, Path], log_sql_queries: bool = True
):
    if log_sql_queries and os.environ.get("FLASK_ENV", "") == "development":
        # if debugging, log the SQL queries
        logger = logging.getLogger("peewee")
        logger.addHandler(logging.StreamHandler())
        logger.setLevel(logging.DEBUG)

    app = Flask(
        __name__,
        template_folder=os.path.join(pkg_dir, "www"),
        static_folder=os.path.join(pkg_dir, "www/static"),
        static_url_path="/static",
    )
    app.config["JSON_SORT_KEYS"] = False

    @app.route("/", defaults={"_path": ""})
    @app.route("/<path:_path>")
    def home(_path):
        return render_template("index.html")

    if isinstance(controllers, list):
        blueprints = controllers
    else:
        # auto discover blueprints
        blueprints = []
        for m in pkgutil.iter_modules(controllers.__path__):
            controller = importlib.import_module(f"{controllers.__name__}.{m.name}")
            for attrname in dir(controller):
                attr = getattr(controller, attrname)
                if isinstance(attr, Blueprint):
                    blueprints.append(attr)

    for bp in blueprints:
        app.register_blueprint(bp, url_prefix="/api")

    return app
