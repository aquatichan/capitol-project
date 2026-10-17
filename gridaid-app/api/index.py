import sys
from pathlib import Path

# Make backend/main.py importable from the Vercel function.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from main import app  # noqa: E402,F401
