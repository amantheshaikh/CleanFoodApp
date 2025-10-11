from __future__ import annotations

import json
import sys
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

# Ensure the project root (which hosts server.py) is importable when this module
# runs from inside the backend package or a Docker image with /app as workdir.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import importlib.util

try:
    from server import build_capabilities, process_ingredients  # noqa: E402
except ModuleNotFoundError:
    legacy_path = PROJECT_ROOT / 'server.py'
    spec = importlib.util.spec_from_file_location('legacy_server', legacy_path)
    if spec is None or spec.loader is None:
        raise
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    build_capabilities = getattr(module, 'build_capabilities')
    process_ingredients = getattr(module, 'process_ingredients')

ALLOWED_ORIGINS = [
    "https://clean-food-app.vercel.app",
    "https://clean-food-app-git-main-amantheshaikh.vercel.app",
    "http://localhost:5173",
]

VERCEL_REGEX = r"https://([^.]+-)*clean-food-app.*\.vercel\.app"


class CheckPayload(BaseModel):
    ingredients: str = Field(..., min_length=1, description="Raw ingredient text to analyse")
    preferences: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional diet/allergy configuration matching the legacy server payload",
    )



def _parse_preferences(raw_preferences: Any) -> Optional[Dict[str, Any]]:
    if isinstance(raw_preferences, dict):
        return raw_preferences
    if isinstance(raw_preferences, str) and raw_preferences.strip():
        try:
            parsed = json.loads(raw_preferences)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None


async def _resolve_payload(request: Request, payload: Optional[CheckPayload]) -> CheckPayload:
    if payload is not None:
        return payload

    content_type = (request.headers.get('Content-Type') or '').lower()
    if 'application/json' in content_type:
        data = await request.json()
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail='JSON body must be an object')
        try:
            return CheckPayload(**data)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors())

    if 'application/x-www-form-urlencoded' in content_type or 'multipart/form-data' in content_type:
        form = await request.form()
        ingredients = form.get('ingredients', '')
        preferences = _parse_preferences(form.get('preferences'))
        try:
            return CheckPayload(ingredients=ingredients, preferences=preferences)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors())

    body_bytes = await request.body()
    if not body_bytes:
        raise HTTPException(status_code=400, detail='Request body is empty')
    try:
        body_text = body_bytes.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail='Request body is not valid UTF-8 text')

    parsed = urllib.parse.parse_qs(body_text)
    if parsed:
        ingredients = parsed.get('ingredients', [''])[-1]
        pref_values = parsed.get('preferences')
        pref_raw = pref_values[-1] if pref_values else None
        preferences = _parse_preferences(pref_raw)
        try:
            return CheckPayload(ingredients=ingredients, preferences=preferences)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors())

    raise HTTPException(status_code=400, detail='Unsupported request body format')


class CheckResponse(BaseModel):
    source: str
    ingredients: List[str]
    canonical: List[str]
    taxonomy: List[Dict[str, Any]]
    is_clean: bool
    hits: List[str]
    diet_hits: List[str] = Field(default_factory=list)
    diet_preference: Optional[str] = None
    allergy_hits: List[str] = Field(default_factory=list)
    allergy_preferences: List[str] = Field(default_factory=list)
    taxonomy_error: Optional[str] = None
    additives_error: Optional[str] = None


app = FastAPI(title="Clean Food Checker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=VERCEL_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/capabilities")
async def capabilities() -> Dict[str, Any]:
    return build_capabilities()


@app.post("/check", response_model=CheckResponse)
async def check(request: Request, payload: Optional[CheckPayload] = Body(default=None)) -> CheckResponse:
    payload = await _resolve_payload(request, payload)
    ingredients = payload.ingredients.strip()
    if not ingredients:
        raise HTTPException(status_code=400, detail="ingredients cannot be empty")

    try:
        analysis = process_ingredients(ingredients, payload.preferences)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive guardrail
        raise HTTPException(status_code=500, detail=f"analysis failed: {exc}") from exc

    return CheckResponse(**analysis)


@app.get("/")
async def root() -> Dict[str, str]:
    return {"message": "Clean Food Checker backend is running"}
