import argparse
import logging
import sys

from dotenv import load_dotenv


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="incident-agent",
        description=(
            "Investigate a production incident from a message, using the settings and "
            "connectors configured in the web UI (stored in APP_DATABASE_URL)."
        ),
    )
    parser.add_argument(
        "message",
        help='What to investigate, e.g. "order 12345 failed at checkout". Use - to read from stdin.',
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Load APP_DATABASE_URL / APP_SECRET_KEY from this file if it exists (default: .env)",
    )
    parser.add_argument("-q", "--quiet", action="store_true", help="Only print the report")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING if args.quiet else logging.INFO)
    load_dotenv(args.env_file)

    message = sys.stdin.read() if args.message == "-" else args.message
    if not message.strip():
        parser.error("message is empty")

    # Imported after load_dotenv so the app settings see the environment.
    from .server.core.crypto import get_secret_box
    from .server.db.session import get_sessionmaker, init_db
    from .server.repos.connector_repo import ConnectorRepo
    from .server.repos.investigation_repo import InvestigationRepo
    from .server.repos.settings_repo import SettingsRepo
    from .server.services.connectors.service import ConnectorService
    from .server.services.investigation.service import InvestigationService
    from .server.services.settings.service import SettingsService

    init_db()
    box = get_secret_box()
    with get_sessionmaker()() as session:
        service = InvestigationService(
            ConnectorService(ConnectorRepo(session), box),
            SettingsService(SettingsRepo(session), box),
            InvestigationRepo(session),
        )
        if not service.connectors.plugins_config():
            print("No connector is enabled. Add one in the web UI: incident-agent-server", file=sys.stderr)
        result = service.investigate(message)

    print("\nInvestigation report:\n")
    print(result.report)


if __name__ == "__main__":
    main()
