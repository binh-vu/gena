from __future__ import annotations
import importlib
import logging
import os
import pkgutil
from modulefinder import Module
from pathlib import Path
from typing import Union

from flask import Flask, render_template, Blueprint, send_from_directory


def generate_app(
    controllers: Union[list[Blueprint], Module],
    pkg_dir: Union[str, Path],
    log_sql_queries: bool = True,
) -> Flask:
    if log_sql_queries and any(
        os.environ.get(key, "") == "development" for key in ["FLASK_ENV", "FLASK_DEBUG"]
    ):
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
    app.config["app.json.sort_keys"] = False

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def home(path):
        if path.find("/") == -1 and path.find(".") != -1:
            if path.endswith(".json") or path.endswith(".ico") or path.endswith(".png"):
                return send_from_directory(app.template_folder, path)

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
