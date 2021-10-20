import os
import click
from loguru import logger
from tornado.httpserver import HTTPServer
from tornado.ioloop import IOLoop
from tornado.wsgi import WSGIContainer
from flask_peewee_restful import generate_app, generate_api
from todolist.models import TodoList

app = generate_app(
    [generate_api(model) for model in [TodoList]],
    os.path.dirname(__file__)
)


@click.command()
@click.option(
    "-d", "--dbfile", default="", help="smc database file"
)
@click.option(
    "--wsgi", is_flag=True, help="Whether to use wsgi server"
)
@click.option(
    "-p", "--port", default=5000, help="Listening port"
)
@click.option(
    "--certfile", default=None, help="Path to the certificate signing request"
)
@click.option("--keyfile", default=None, help="Path to the key file")
def start(dbfile: str, wsgi: bool, port: int, certfile: str, keyfile: str):
    if dbfile.strip() != "" and 'DBFILE' not in os.environ:
        os.environ['DBFILE'] = dbfile.strip()

    if certfile is None or keyfile is None:
        ssl_options = None
    else:
        ssl_options = {"certfile": certfile, "keyfile": keyfile}
        assert not wsgi

    if wsgi:
        app.run(host="0.0.0.0", port=port)
    else:
        logger.info("Start server in non-wsgi mode")
        http_server = HTTPServer(WSGIContainer(app), ssl_options=ssl_options)
        http_server.listen(port)
        IOLoop.instance().start()


if __name__ == '__main__':
    start()