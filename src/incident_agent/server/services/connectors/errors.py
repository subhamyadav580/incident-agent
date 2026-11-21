class ConnectorError(Exception):
    pass


class ConnectorNotFound(ConnectorError):
    pass


class ConnectorConflict(ConnectorError):
    pass


class ConnectorInvalid(ConnectorError):
    pass


class ConnectorUnavailable(ConnectorError):
    """The data source could not be reached with the given settings."""
