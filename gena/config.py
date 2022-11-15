from typing import Literal
import warnings


class GenaConfig:
    """Configuring how Gena generating works"""

    instance = None

    # how peewee foreign key fields are serialized.
    # - peewee_field: foreign key id is serialized as the same name as the foreign key field (e.g., "user" instead of "user_id")
    # - db_field: foreign key id is serialized as the name in database column (e.g., "user_id" instead of "user")
    #
    # NOTE: the new suggested configu is to use `db_field` as users may want to populate the foreign key field with the actual object.
    # `peewee_field` option is set as default to compatible with previous version but is deprecated and will generate warning
    # if used.
    SERIALIZE_FOREIGN_KEY_FIELD_NAME: Literal[
        "peewee_field", "db_field"
    ] = "peewee_field"

    @staticmethod
    def get_instance():
        if GenaConfig.instance is None:
            GenaConfig.instance = GenaConfig()
            GenaConfig.instance.check()
        return GenaConfig.instance

    def check(self):
        if self.SERIALIZE_FOREIGN_KEY_FIELD_NAME == "peewee_field":
            warnings.warn(
                "GenaConfig.SERIALIZE_FOREIGN_KEY_FIELD_NAME is set to 'peewee_field'. This is deprecated and will be removed in the future. Please use 'db_field' instead.",
                DeprecationWarning,
                stacklevel=2,
            )
