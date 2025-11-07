from __future__ import annotations

import json
import urllib.parse
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from .server import build_capabilities, process_ingredients

ALLOWED_ORIGINS = [
    "https://clean-food-app.vercel.app",
    "https://clean-food-app-git-main-amantheshaikh.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://10.0.2.2:3000",
    "http://10.0.2.2:3001",
    "capacitor://localhost",
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


async def _resolve_payload(request: Request) -> CheckPayload:
    content_type = (request.headers.get('Content-Type') or '').lower()
    if 'application/json' in content_type:
        try:
            data = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f'Invalid JSON body: {exc}')
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
    body_text = ''
    if body_bytes:
        try:
            body_text = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail='Request body is not valid UTF-8 text')
        parsed = urllib.parse.parse_qs(body_text, keep_blank_values=True)
        if parsed:
            ingredients = parsed.get('ingredients', [''])[-1]
            pref_values = parsed.get('preferences')
            pref_raw = pref_values[-1] if pref_values else None
            preferences = _parse_preferences(pref_raw)
            try:
                return CheckPayload(ingredients=ingredients, preferences=preferences)
            except ValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.errors())
        stripped = body_text.strip()
        if stripped:
            try:
                return CheckPayload(ingredients=stripped, preferences=None)
            except ValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.errors())

    query_params = request.query_params
    if query_params:
        ingredients = query_params.get('ingredients', '')
        preferences = _parse_preferences(query_params.get('preferences'))
        if ingredients:
            try:
                return CheckPayload(ingredients=ingredients, preferences=preferences)
            except ValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.errors())

    raise HTTPException(status_code=400, detail='Missing or invalid ingredients payload')


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
async def check(request: Request) -> CheckResponse:
    payload = await _resolve_payload(request)
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
