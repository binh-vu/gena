import os

from peewee import SqliteDatabase, Model, BooleanField, TextField


db = SqliteDatabase(os.environ["DBFILE"])


class TodoList(Model):
    class Meta:
        database = db
        db_table = "todo_list"

    checked = BooleanField()
    todo = TextField()


if not os.path.exists(os.environ["DBFILE"]):
    db.create_tables([TodoList], safe=True)
    TodoList.insert_many(
        [
            {"checked": False, "todo": "go grocery"},
            {"checked": False, "todo": "do laundry"},
        ]
    ).execute()
