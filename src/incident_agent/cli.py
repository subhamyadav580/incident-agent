import argparse
import logging
import os
import sys

from dotenv import load_dotenv

from .app import build_agent, load_config


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="incident-agent",
        description="Investigate a production incident from a message, using your logs and databases.",
    )
    parser.add_argument(
        "message",
        help='What to investigate, e.g. "order 12345 failed at checkout". Use - to read from stdin.',
    )
    parser.add_argument(
        "-c", "--config",
        default=os.environ.get("INCIDENT_AGENT_CONFIG", "configs/agent.yaml"),
        help="Path to agent.yaml (default: $INCIDENT_AGENT_CONFIG or configs/agent.yaml)",
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Load environment variables from this file if it exists (default: .env)",
    )
    parser.add_argument("-q", "--quiet", action="store_true", help="Only print the report")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING if args.quiet else logging.INFO)
    load_dotenv(args.env_file)

    message = sys.stdin.read() if args.message == "-" else args.message
    if not message.strip():
        parser.error("message is empty")

    with build_agent(load_config(args.config)) as agent:
        report = agent.investigate(message)

    print("\nInvestigation report:\n")
    print(report)


if __name__ == "__main__":
    main()
