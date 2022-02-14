import os
from flask_peewee_restful import generate_app, generate_api
from todolist.models import TodoList

app = generate_app(
    controllers=[generate_api(model) for model in [TodoList]],
    pkg_dir=os.path.dirname(__file__),
)
