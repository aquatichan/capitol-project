# GridAid

Dev (two terminals):
  cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
  cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api -> :8000)

Rebuild precompute after adding data/<county>/zcta.csv + sites.csv:
  cd backend && python build.py 10

Prod (one server): cd frontend && npm run build, then run uvicorn; it serves frontend/dist.
