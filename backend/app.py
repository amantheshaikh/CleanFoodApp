from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
async def check(payload: CheckPayload) -> CheckResponse:
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
