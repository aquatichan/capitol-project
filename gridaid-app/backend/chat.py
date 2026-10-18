"""The logistics page's assistant: Gemini with Google Search grounding, held to one narrow job.

Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in the server environment. The key never reaches the browser.
POST /api/chat  {"messages": [{"role": "user"|"assistant", "text": "..."}], "context": {...page state...}}
-> {"text": "...", "sources": [{"title", "uri"}], "queries": [...]}
"""
import json
import os
import ssl
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL = ssl.create_default_context()

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")   # Google's recommended Flash model as of Oct 2026
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_TURNS, MAX_CHARS, MAX_CONTEXT = 12, 2000, 4000
RATE = (20, 600)                       # requests per IP per window (seconds); best effort on serverless
_hits = defaultdict(deque)

# The roadmap the model must follow on every turn. Order matters: scope, then place and time, then search, then
# check, then answer in a fixed shape. It is a planning aid for officials and residents, never an emergency service.
SYSTEM = """You are GridAid's outage research assistant. GridAid helps county officials and residents plan backup-power
sites for people who rely on electricity-powered medical equipment (home oxygen, dialysis, ventilators, powered
wheelchairs). You answer questions about three things only:
  1. the power grid: current and recent outages, restoration, grid emergencies, planned shutoffs;
  2. natural disasters and extreme weather that threaten power (hurricanes, winter storms, heat waves, wildfires,
     floods, tornadoes, derechos);
  3. the human toll: deaths, hospital visits, heat or cold illness, and especially harm to people who depend on
     powered medical equipment, and what shelters or cooling and warming centers are open.
If a question falls outside these, say in one sentence that you only cover outages, disasters and their effect on
people, and suggest a question you can answer. Do not answer it anyway.

WORKFLOW. Follow these steps in order on every turn.
Step 1, place and time. Use the county in CONTEXT unless the user names another place. Turn words like "now",
  "today", "this week", "recent" into dates relative to TODAY in CONTEXT. If the place is unclear, ask one short
  question instead of guessing.
Step 2, search first. For anything about current or recent conditions you MUST use Google Search before answering.
  Never answer current conditions from memory. Prefer sources in this order:
    a. the electric utility's outage map, newsroom, or restoration updates;
    b. the grid operator or regulator (ERCOT, CAISO, PJM, MISO, SPP, NYISO, ISO-NE, state public utility commission);
    c. the National Weather Service, NOAA, the National Hurricane Center, and official alerts;
    d. FEMA, state and county emergency management, and 211 or shelter listings;
    e. HHS (ASPR, emPOWER), the CDC, and state or local health departments;
    f. established news outlets, only to fill gaps, and say so.
Step 3, check freshness. Note when each fact was published or last updated. Flag anything older than 72 hours as
  possibly out of date. If you found nothing recent, say that plainly instead of filling the gap.
Step 4, check the numbers. Customers out, deaths, and hospital counts must each come from a named source. If two
  sources disagree, give both or a range and say which is newer. Customers are accounts, not people; say so.
Step 5, answer in this shape, under about 220 words unless the user asks for more:
  Bottom line: one or two sentences.
  What's happening: short bullets, each with its date and source number.
  Who is at risk: who is most exposed, especially people on oxygen, dialysis, ventilators or powered wheelchairs.
  What the county can do: tie to the GridAid plan in CONTEXT when it helps (sites, reach, people not yet reached,
    the ZIP codes left out). Keep it practical: open a site, run a generator, check on registered households.
  Sources: numbered, title and date.

RULES.
- Never invent outage numbers, deaths, dates, sources, or links. If you cannot confirm something, say "I couldn't
  confirm" and stop there.
- You are not an emergency service. If someone describes an emergency or a person in danger, tell them to call 911
  first, before anything else. For their own outage, point them to their utility.
- No medical advice about a specific person's device, dose, or treatment; say to call their doctor, equipment
  supplier, or 911.
- Talk about groups and places, never about individuals. Do not try to identify or locate anyone.
- GridAid's numbers are planning estimates (Medicare members only, straight-line distance). Do not present them as
  a safety guarantee.
- Stay neutral. Report what officials and utilities said; do not assign blame or argue politics.
- Plain language. No markdown tables, no emoji.
"""


def _limited(ip):
    now, q = time.time(), _hits[ip]
    while q and now - q[0] > RATE[1]:
        q.popleft()
    if len(q) >= RATE[0]:
        return True
    q.append(now)
    return False


def _clean(messages):
    out = []
    for m in (messages or [])[-MAX_TURNS:]:
        if not isinstance(m, dict):
            continue
        text = str(m.get("text", "")).strip()[:MAX_CHARS]
        if text:
            out.append({"role": "model" if m.get("role") == "assistant" else "user", "parts": [{"text": text}]})
    while out and out[0]["role"] != "user":   # Gemini wants the conversation to open with the user
        out.pop(0)
    return out


def answer(messages, context, ip="?"):
    """Returns (status_code, body)."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return 503, {"error": "not-configured", "message": "The assistant isn't set up on this server yet (GEMINI_API_KEY is missing)."}
    if _limited(ip):
        return 429, {"error": "busy", "message": "Too many questions in a short time. Try again in a few minutes."}
    contents = _clean(messages)
    if not contents or contents[-1]["role"] != "user":
        return 400, {"error": "empty", "message": "Ask a question first."}
    ctx = json.dumps(context or {}, separators=(",", ":"))[:MAX_CONTEXT]
    body = {
        "systemInstruction": {"parts": [{"text": f"{SYSTEM}\nCONTEXT (from the GridAid page the user is looking at; planning estimates):\n{ctx}"}]},
        "contents": contents,
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1024},
    }
    req = urllib.request.Request(
        URL.format(model=MODEL), data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=45, context=_SSL) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        return 502, {"error": "upstream", "message": f"The AI service returned {e.code}.", "detail": detail}
    except (urllib.error.URLError, TimeoutError) as e:
        return 504, {"error": "timeout", "message": f"Couldn't reach the AI service ({e})."}

    cand = (data.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", [])).strip()
    meta = cand.get("groundingMetadata") or {}
    sources, seen = [], set()
    for ch in meta.get("groundingChunks", []):
        web = ch.get("web") or {}
        if web.get("uri") and web["uri"] not in seen:
            seen.add(web["uri"])
            sources.append({"title": web.get("title") or web["uri"], "uri": web["uri"]})
    if not text:
        return 502, {"error": "empty-answer", "message": "The AI service returned no answer (it may have been blocked). Try rephrasing."}
    return 200, {"text": text, "sources": sources[:8], "queries": meta.get("webSearchQueries", [])[:6], "model": MODEL}
