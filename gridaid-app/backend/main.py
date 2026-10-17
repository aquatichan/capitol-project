import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
DIST = BASE.parent / "frontend" / "dist"

app = FastAPI(title="GridAid")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/data")
def data():
    return json.loads((BASE / "data.json").read_text())


# Production: serve the built React app from the same server.
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
