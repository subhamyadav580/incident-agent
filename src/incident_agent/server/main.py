import argparse
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .core.config import get_settings
from .core.crypto import generate_key
from .db.session import init_db
from .routes import connectors, investigations, settings

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="incident-agent", lifespan=lifespan)
    app.include_router(connectors.router)
    app.include_router(investigations.router)
    app.include_router(settings.router)
    mount_ui(app)
    return app


NOT_BUILT = """<!doctype html><meta charset="utf-8"><title>Incident Agent</title>
<body style="font-family:system-ui;padding:40px;max-width:640px">
<h2>The web UI is not built yet</h2>
<p>Build it once (Node 20+):</p>
<pre>cd frontend && npm install && npm run build</pre>
<p>The API is running: <a href="/docs">/docs</a>.</p></body>"""


def mount_ui(app: FastAPI) -> None:
    """Serve the React build from static/, falling back to index.html for client-side routes."""
    index = STATIC_DIR / "index.html"
    if (STATIC_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        file = (STATIC_DIR / path).resolve()
        if path and file.is_file() and STATIC_DIR.resolve() in file.parents:
            return FileResponse(file)
        if index.is_file():
            return FileResponse(index)
        return HTMLResponse(NOT_BUILT)


def run(argv=None):
    parser = argparse.ArgumentParser(prog="incident-agent-server", description="Web UI and API for incident-agent.")
    parser.add_argument("--generate-key", action="store_true", help="Print a new APP_SECRET_KEY and exit")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    args = parser.parse_args(argv)

    if args.generate_key:
        print(generate_key())
        return

    load_dotenv(args.env_file)
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()

    import uvicorn

    uvicorn.run(create_app(), host=args.host or settings.host, port=args.port or settings.port)


if __name__ == "__main__":
    run()
