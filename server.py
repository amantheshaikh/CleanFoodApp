#!/usr/bin/env python3
"""Clean Food Checker (taxonomy-driven version)."""

from __future__ import annotations

import argparse
import base64
import difflib
import html
import io
import json
import mimetypes
import os
import re
import textwrap
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from collections import defaultdict, deque

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

try:
    import cv2
    import numpy as np

    OPENCV_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    cv2 = None
    np = None
    OPENCV_AVAILABLE = False

try:
    from openfoodfacts import ProductDataset

    OFF_DATASET_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    ProductDataset = None
    OFF_DATASET_AVAILABLE = False

try:
    import pytesseract  # type: ignore

    PYTESSERACT_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    pytesseract = None  # type: ignore
    PYTESSERACT_AVAILABLE = False

FORBIDDEN_INGREDIENTS = {
    "sugar",
    "refined sugar",
    "invert sugar",
    "high fructose corn syrup",
    "hfcs",
    "glucose syrup",
    "fructose syrup",
    "maltodextrin",
    "dextrose",
    "palm oil",
    "hydrogenated",
    "partially hydrogenated",
    "shortening",
    "msg",
    "monosodium glutamate",
    "e621",
    "sodium benzoate",
    "e211",
    "potassium sorbate",
    "e202",
    "sodium nitrite",
    "e250",
    "bha",
    "bht",
    "tert-butylhydroquinone",
    "tb hq",
    "e319",
    "sodium nitrate",
    "sodium nitrates",
    "sodium nitrites",
    "artificial colour",
    "artificial color",
    "artificial flavour",
    "artificial flavor",
    "tartrazine",
    "e102",
    "sunset yellow",
    "e110",
    "ponceau 4r",
    "e124",
    "aspartame",
    "acesulfame k",
    "acesulfame-k",
    "saccharin",
    "sucralose",
    "acesulfame",
    "potassium bromate",
    "propyl gallate",
    "calcium propionate",
    "corn syrup solids",
    "neotame",
    "carrageenan",
    "polysorbate 80",
    "propylene glycol",
    "mono and diglycerides",
    "mono- and diglycerides",
    "monoglycerides",
    "diglycerides",
    "lecithin",
}

DEFAULT_FLAG_IDS = {
    "en:sugar",
    "en:sugar-various-sugars",
    "en:high-fructose-corn-syrup",
    "en:palm-oil",
    "en:palm-oil-and-fat",
    "en:monosodium-glutamate",
    "en:e621",
    "en:sodium-benzoate",
    "en:tartrazine",
    "en:sodium-nitrate",
    "en:sodium-nitrite",
    "en:potassium-bromate",
    "en:propyl-gallate",
    "en:calcium-propionate",
    "en:corn-syrup-solids",
    "en:neotame",
    "en:carrageenan",
    "en:polysorbate-80",
    "en:propylene-glycol",
    "en:mono-and-diglycerides-of-fatty-acids",
    "en:lecithins",
}

DEFAULT_STOPWORDS = {
    "en": {
        "and",
        "with",
        "contains",
        "containing",
        "made of",
        "made from",
        "made with",
        "may contain",
        "including",
        "includes",
        "ingredients",
        "other ingredients",
        "trace",
        "traces",
        "total",
        "per",
        "into",
    }
}

SPECIAL_TOKEN_REPLACEMENTS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"mono-\s+and\s+diglycerides", re.IGNORECASE), "mono-and-diglycerides"),
]

SPECIAL_STOPWORD_EXEMPT = {
    "mono- and diglycerides",
    "mono-and-diglycerides",
    "mono and diglycerides",
}

LANG_LINE_RE = re.compile(r"^([a-z]{2}(?:-[a-z0-9]+)?)\s*:(.*)$", re.IGNORECASE)

OFF_DEFAULT_COUNTRY = os.environ.get("OFF_COUNTRY", "world")
OFF_DEFAULT_LANGUAGE = os.environ.get("OFF_LANGUAGE", "en").lower() or "en"

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = BASE_DIR / "templates" / "index.html"
_revamped_candidates = [
    BASE_DIR / "Clean_Food_App_Revamped",
    BASE_DIR / "Clean Food App Revamped",
]
REVAMPED_DIR = next((path for path in _revamped_candidates if path.exists()), _revamped_candidates[0])
REVAMPED_BUILD_DIR = REVAMPED_DIR / "build"
REVAMPED_DIST_DIR = REVAMPED_DIR / "dist"
REVAMPED_ROOT = REVAMPED_BUILD_DIR if REVAMPED_BUILD_DIR.exists() else REVAMPED_DIST_DIR
REVAMPED_INDEX = REVAMPED_ROOT / "index.html"
REVAMPED_AVAILABLE = REVAMPED_INDEX.exists()
REVAMPED_ERROR: Optional[str]
if REVAMPED_AVAILABLE:
    REVAMPED_ERROR = None
else:
    if REVAMPED_DIR.exists():
        REVAMPED_ERROR = "Build output not found (expected dist/ or build/)"
    else:
        REVAMPED_ERROR = None

_tax_langs_env = [lang.strip().lower() for lang in os.environ.get("OFF_TAXONOMY_LANGS", "en").split(",") if lang.strip()]
_seen_langs: Set[str] = set()
OFF_TAXONOMY_LANGS: List[str] = []
for lang in _tax_langs_env or ["en"]:
    if lang not in _seen_langs:
        OFF_TAXONOMY_LANGS.append(lang)
        _seen_langs.add(lang)

ACTIVE_LANGS: Set[str] = {"en"}
if OFF_DEFAULT_LANGUAGE:
    ACTIVE_LANGS.add(OFF_DEFAULT_LANGUAGE.lower())

OFF_TAXONOMY_PATH = os.environ.get("OFF_TAXONOMY_PATH")
OFF_ADDITIVES_PATH = os.environ.get("OFF_ADDITIVES_PATH")
OFF_DATASET_TYPE = os.environ.get("OFF_DATASET_TYPE", "csv")
OFF_DATASET_FIELDS = [f.strip() for f in os.environ.get(
    "OFF_DATASET_FIELDS", "code,product_name,ingredients_text,ingredients_text_en,brands,ingredients_tags"
).split(",") if f.strip()]
OFF_DATASET_MAX_SCAN = int(os.environ.get("OFF_DATASET_MAX_SCAN", "200000"))

# Try a couple of default locations for ingredients.txt when env var is not set
if not OFF_TAXONOMY_PATH:
    guesses = [
        BASE_DIR / "ingredients.txt",
        BASE_DIR / "taxonomies" / "ingredients.txt",
    ]
    for guess in guesses:
        if guess.exists():
            OFF_TAXONOMY_PATH = str(guess)
            break

if not OFF_ADDITIVES_PATH:
    guesses = [
        BASE_DIR / "additives.txt",
        BASE_DIR / "taxonomies" / "additives.txt",
    ]
    for guess in guesses:
        if guess.exists():
            OFF_ADDITIVES_PATH = str(guess)
            break


# --- Utility helpers -----------------------------------------------------

def normalize_token(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[\u2010\u2011\u2012\u2013\u2014]", "-", text)
    text = re.sub(r"[^a-z0-9+\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def titleize(text: str) -> str:
    parts = []
    for piece in text.split():
        parts.append(piece.upper() if piece.isupper() else piece.capitalize())
    return " ".join(parts)


@dataclass
class IngredientNode:
    node_id: str
    names: Dict[str, str] = field(default_factory=dict)
    synonyms: Dict[str, List[str]] = field(default_factory=dict)
    parent_ids: Set[str] = field(default_factory=set)
    parents: List["IngredientNode"] = field(default_factory=list)
    properties: Dict[str, Any] = field(default_factory=dict)

    def add_name(self, lang: str, value: str) -> None:
        key = lang.lower()
        cleaned = value.strip()
        if not cleaned:
            return
        parts = [part.strip() for part in re.split(r"[;,]", cleaned) if part.strip()]
        if not parts:
            return
        primary = parts[0]
        if key not in self.names:
            self.names[key] = primary
        elif primary.lower() != self.names[key].lower():
            self.add_synonym(key, primary)
        for extra in parts[1:]:
            self.add_synonym(key, extra)

    def add_synonym(self, lang: str, value: str) -> None:
        key = lang.lower()
        cleaned = value.strip()
        if not cleaned:
            return
        bucket = self.synonyms.setdefault(key, [])
        if cleaned not in bucket:
            bucket.append(cleaned)

    def add_parent(self, node_id: str) -> None:
        node_id = node_id.strip()
        if node_id:
            self.parent_ids.add(node_id)


class IngredientTaxonomy:
    def __init__(self, path: Optional[str] = None):
        self.nodes: Dict[str, IngredientNode] = {}
        self.mapping: Dict[str, str] = {}
        self.stopwords: Dict[str, Set[str]] = {}
        self._plain_tokens: Set[str] = set()
        if path:
            self.load(path)

    def load(self, path: str) -> None:
        nodes, stopwords = self._parse_file(path)
        self.nodes = nodes
        self.stopwords = stopwords
        self.mapping.clear()
        self._plain_tokens.clear()

        active_langs = {lang.lower() for lang in ACTIVE_LANGS}

        for node_id, node in nodes.items():
            plain = normalize_token(node_id.split(":", 1)[-1])
            self._register_mapping(node_id.lower(), node_id)
            if plain:
                self._register_mapping(plain, node_id, prefer=True)
                self._plain_tokens.add(plain)
            for lang, name in node.names.items():
                token = normalize_token(name)
                if token:
                    if lang.lower() in active_langs:
                        self._register_mapping(token, node_id, prefer=True)
                        self._plain_tokens.add(token)
                    self._register_mapping(f"{lang}:{token}", node_id)
            for lang, syns in node.synonyms.items():
                for syn in syns:
                    token = normalize_token(syn)
                    if token:
                        if lang.lower() in active_langs:
                            self._register_mapping(token, node_id)
                            self._plain_tokens.add(token)
                        self._register_mapping(f"{lang}:{token}", node_id)

        # resolve parent references
        for node in nodes.values():
            node.parents = [nodes[parent_id] for parent_id in node.parent_ids if parent_id in nodes]

    def _register_mapping(self, key: str, node_id: str, prefer: bool = False) -> None:
        if not key:
            return
        existing = self.mapping.get(key)
        if not existing or prefer:
            self.mapping[key] = node_id
            return
        if existing == node_id:
            return
        existing_canonical = normalize_token(existing.split(":", 1)[-1])
        new_canonical = normalize_token(node_id.split(":", 1)[-1])
        if key == new_canonical and key != existing_canonical:
            self.mapping[key] = node_id

    def _parse_file(self, path: str) -> Tuple[Dict[str, IngredientNode], Dict[str, Set[str]]]:
        nodes: Dict[str, IngredientNode] = {}
        stopwords: Dict[str, Set[str]] = {}
        ingredient_header = re.compile(r"#\s*ingredient/([^\s#]+)", re.IGNORECASE)
        parent_hint = re.compile(r"#\s*<\s*([a-z]{2}(?::[^\s#]+)?)", re.IGNORECASE)

        def fresh_block() -> Dict[str, Any]:
            return {
                "slug": None,
                "names": {},
                "synonyms": {},
                "parents": set(),
                "properties": {},
            }

        block: Dict[str, Any] = fresh_block()

        def add_name_entry(lang: str, value: str) -> None:
            bucket = block.setdefault("names", {}).setdefault(lang.lower(), [])
            bucket.append(value.strip())

        def add_synonym_entry(lang: str, value: str) -> None:
            bucket = block.setdefault("synonyms", {}).setdefault(lang.lower(), [])
            bucket.append(value.strip())

        def finalize_block() -> None:
            nonlocal block
            names = block.get("names", {})
            synonyms = block.get("synonyms", {})
            if not names and not synonyms:
                block = fresh_block()
                return

            slug = block.get("slug")
            slug_lang = "en"
            slug_value: Optional[str] = None
            if slug:
                if ":" in slug:
                    slug_lang, slug_value = slug.split(":", 1)
                else:
                    slug_value = slug
            if not slug_value:
                primary_lang = "en" if names.get("en") else next(iter(names), "en")
                primary_values = names.get(primary_lang, [])
                primary_name = primary_values[0] if primary_values else f"ingredient-{len(nodes) + 1}"
                slug_value = normalize_token(primary_name).replace(" ", "-") or f"ingredient-{len(nodes) + 1}"
                slug_lang = primary_lang

            node = IngredientNode(node_id=f"{slug_lang}:{slug_value}")

            for lang, values in names.items():
                for value in values:
                    node.add_name(lang, value)

            for lang, values in synonyms.items():
                for value in values:
                    node.add_synonym(lang, value)

            for parent_id in block.get("parents", set()):
                if ":" not in parent_id:
                    parent_id = f"en:{parent_id}"
                node.add_parent(parent_id)

            node.properties.update(block.get("properties", {}))

            for lang, values in list(node.synonyms.items()):
                seen: Set[str] = set()
                deduped = []
                for value in values:
                    low = value.lower()
                    if low in seen:
                        continue
                    seen.add(low)
                    deduped.append(value)
                node.synonyms[lang] = deduped

            nodes[node.node_id] = node
            block = fresh_block()

        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    finalize_block()
                    continue

                if line.startswith("#"):
                    header_match = ingredient_header.match(line)
                    if header_match:
                        finalize_block()
                        block["slug"] = header_match.group(1).strip()
                        continue

                    parent_match = parent_hint.match(line)
                    if parent_match:
                        block.setdefault("parents", set()).add(parent_match.group(1))
                    continue

                if line.lower().startswith("stopwords"):
                    cleaned = line.replace("stopwords;", "stopwords:")
                    parts = cleaned.split(":", 2)
                    if len(parts) >= 3:
                        if parts[0].lower().startswith("stopwords") and ":" in cleaned:
                            lang = parts[1].strip().lower()
                            words = parts[2].replace(";", ",")
                        else:
                            lang = parts[0].split(";", 1)[-1].strip().lower()
                            words = parts[-1]
                        tokens = [normalize_token(w) for w in words.split(",") if normalize_token(w)]
                        if lang and tokens:
                            stopwords.setdefault(lang, set()).update(tokens)
                    continue

                if line.startswith("<"):
                    alias = line[1:].strip()
                    match = LANG_LINE_RE.match(alias)
                    if match:
                        lang = match.group(1).strip().lower()
                        value = match.group(2).strip()
                        add_synonym_entry(lang, value)
                    continue

                if ":" not in line:
                    finalize_block()
                    block["slug"] = line.strip()
                    continue

                key, _, rest = line.partition(":")
                field = key.strip()
                value = rest.strip()
                if not field:
                    continue

                lowered_field = field.lower()
                lang_match = LANG_LINE_RE.match(line)
                if lang_match and len(field) == 2:
                    lang = field.lower()
                    add_name_entry(lang, value)
                    continue

                if lowered_field == "synonyms":
                    lang, _, names_value = value.partition(":")
                    lang = lang.strip().lower()
                    words = [name.strip() for name in names_value.split(",") if name.strip()]
                    for word in words:
                        add_synonym_entry(lang, word)
                    continue

                if lowered_field == "name":
                    lang, _, text_value = value.partition(":")
                    lang = lang.strip().lower()
                    add_name_entry(lang, text_value.strip())
                    continue

                if lowered_field == "parents":
                    for parent_id in [p.strip() for p in value.split(",") if p.strip()]:
                        block.setdefault("parents", set()).add(parent_id)
                    continue

                if lowered_field == "children":
                    continue

                block.setdefault("properties", {})[field] = value

        finalize_block()
        return nodes, stopwords

    def lookup(self, token: str) -> Optional[IngredientNode]:
        if not token:
            return None
        direct = self.mapping.get(token)
        if direct:
            return self.nodes.get(direct)
        for lang in _build_preferred_languages():
            lang_key = f"{lang}:{token}"
            if lang_key in self.mapping:
                return self.nodes.get(self.mapping[lang_key])
        return None

    def fuzzy(self, token: str) -> Optional[IngredientNode]:
        if not token or not self._plain_tokens:
            return None

        search_pool = list(self._plain_tokens)
        normalized = token

        def best_match(cutoff: float) -> Optional[str]:
            matches = difflib.get_close_matches(normalized, search_pool, n=5, cutoff=cutoff)
            if not matches:
                return None
            best = max(matches, key=lambda candidate: difflib.SequenceMatcher(None, normalized, candidate).ratio())
            return best

        length = len(normalized)
        initial_cutoff = 0.9 if length <= 4 else 0.82 if length <= 8 else 0.75
        match = best_match(initial_cutoff)
        if match is None and length >= 5:
            match = best_match(max(initial_cutoff - 0.1, 0.65))

        if match is None and " " in normalized:
            condensed = normalized.replace(" ", "")
            condensed_pool = {candidate: candidate.replace(" ", "") for candidate in search_pool}
            # Try matching without spaces for messy OCR results
            matches = difflib.get_close_matches(condensed, list(condensed_pool.values()), n=5, cutoff=0.7)
            if matches:
                reverse_lookup = {value: key for key, value in condensed_pool.items()}
                match = reverse_lookup.get(matches[0])

        if match is None:
            return None
        return self.lookup(match)

    def display_name(self, node: IngredientNode) -> str:
        for lang in _build_preferred_languages():
            if lang in node.names:
                return node.names[lang]
        if node.names:
            return next(iter(node.names.values()))
        return node.node_id.split(":", 1)[-1]

    def describe(self, node: IngredientNode) -> Dict[str, Any]:
        display = self.display_name(node)
        parents: List[str] = []
        for parent in node.parents[:5]:
            parents.append(self.display_name(parent))
        synonyms: List[str] = []
        for lang in _build_preferred_languages():
            synonyms.extend(node.synonyms.get(lang, []))
        cleaned_synonyms = []
        seen: Set[str] = set()
        for synonym in synonyms:
            low = synonym.lower()
            if low in seen or normalize_token(synonym) == normalize_token(display):
                continue
            seen.add(low)
            cleaned_synonyms.append(synonym)
            if len(cleaned_synonyms) >= 8:
                break
        return {
            "id": node.node_id,
            "display": display,
            "parents": parents,
            "synonyms": cleaned_synonyms,
        }


@dataclass
class NormalizedIngredient:
    original: str
    token: str
    canonical: str
    display: str
    taxonomy: Optional[Dict[str, Any]]


class IngredientNormalizer:
    def __init__(self, taxonomy: Optional[IngredientTaxonomy], additives: Optional[IngredientTaxonomy] = None):
        self.taxonomy = taxonomy
        self.additives = additives

    def normalize(self, text: str) -> List[NormalizedIngredient]:
        tokens = self._tokenize(text)
        seen: Set[str] = set()
        results: List[NormalizedIngredient] = []
        for raw_token in tokens:
            normalized = normalize_token(raw_token)
            if not normalized or _is_stopword(normalized):
                continue
            canonical, display, taxonomy_info = self._resolve(normalized)
            if canonical in seen:
                continue
            seen.add(canonical)
            results.append(
                NormalizedIngredient(
                    original=raw_token,
                    token=normalized,
                    canonical=canonical,
                    display=display,
                    taxonomy=taxonomy_info,
                )
            )
        return results

    def _tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        cleaned = text.replace("\r", "\n").replace("•", ",")
        segments = re.split(r"[\n;]+", cleaned)
        tokens: List[str] = []
        for segment in segments:
            segment = segment.strip()
            if not segment:
                continue
            for pattern, replacement in SPECIAL_TOKEN_REPLACEMENTS:
                segment = pattern.sub(replacement, segment)
            segment = re.sub(r"\([^)]*\)", " ", segment)
            segment = re.sub(r"\[[^]]*\]", " ", segment)
            segment = re.sub(r"\s+", " ", segment).strip()
            if not segment:
                continue
            pieces = [p.strip() for p in segment.split(",") if p.strip()]
            if not pieces:
                pieces = [segment]
            for piece in pieces:
                lowered_piece = piece.lower()
                if lowered_piece in SPECIAL_STOPWORD_EXEMPT:
                    parts = [piece]
                else:
                    parts = _split_on_stopwords(piece) or [piece]
                for part in parts:
                    token = normalize_token(part.strip(".- "))
                    if token:
                        tokens.append(part.strip())
        return tokens

    def _resolve(self, token: str) -> Tuple[str, str, Optional[Dict[str, Any]]]:
        sources: List[Tuple[Optional[IngredientTaxonomy], str]] = []
        if self.taxonomy is not None:
            sources.append((self.taxonomy, "ingredients"))
        if self.additives is not None:
            sources.append((self.additives, "additives"))

        # Prefer exact matches first (ingredients wins ties to preserve existing behaviour)
        for source, tag in sources:
            if source is None:
                continue
            node = source.lookup(token)
            if node is not None:
                canonical = normalize_token(node.node_id.split(":", 1)[-1])
                display = source.display_name(node)
                info = source.describe(node)
                info["source"] = tag
                return canonical, display, info

        # Fallback to fuzzy with additives first (chemical names) then ingredients
        for source, tag in sorted(sources, key=lambda pair: 0 if pair[1] == "additives" else 1):
            if source is None:
                continue
            node = source.fuzzy(token)
            if node is not None:
                canonical = normalize_token(node.node_id.split(":", 1)[-1])
                display = source.display_name(node)
                info = source.describe(node)
                info["source"] = tag
                return canonical, display, info
        return token, titleize(token), None


# Global mutable state prepared later
INGREDIENT_TAXONOMY: Optional[IngredientTaxonomy] = None
INGREDIENT_NORMALIZER: Optional[IngredientNormalizer] = None
INGREDIENT_TAXONOMY_ERROR: Optional[str] = None
ADDITIVES_TAXONOMY: Optional[IngredientTaxonomy] = None
ADDITIVES_TAXONOMY_ERROR: Optional[str] = None
INGREDIENT_STOPWORDS: Dict[str, Set[str]] = {}
STOPWORD_PHRASES: List[str] = []
STOPWORD_PATTERNS: List[re.Pattern] = []
OFF_DATASET_ERROR: Optional[str] = None
OFF_DATASET_CACHE: Dict[str, Dict[str, Any]] = {}
OFF_DATASET_SCANNED = 0


def _build_preferred_languages(extra: Optional[str] = None) -> List[str]:
    langs: List[str] = []

    def add(lang: Optional[str]) -> None:
        if lang and lang not in langs:
            langs.append(lang)

    add("en")
    add(OFF_DEFAULT_LANGUAGE)
    add(extra)
    for lang in OFF_TAXONOMY_LANGS:
        add(lang)
    langs.append("xx")
    return langs


def _set_stopwords(stopwords_map: Optional[Dict[str, Set[str]]]) -> None:
    global INGREDIENT_STOPWORDS, STOPWORD_PHRASES, STOPWORD_PATTERNS

    combined: Dict[str, Set[str]] = {lang: set(values) for lang, values in DEFAULT_STOPWORDS.items()}
    if stopwords_map:
        for lang, values in stopwords_map.items():
            combined.setdefault(lang.lower(), set()).update(values)

    active_langs = {lang.lower() for lang in ACTIVE_LANGS}
    cleaned: Dict[str, Set[str]] = {}
    for lang, values in combined.items():
        lang_key = lang.lower()
        if lang_key not in active_langs:
            continue
        normalized_values = {normalize_token(value) for value in values if normalize_token(value)}
        if normalized_values:
            cleaned[lang_key] = normalized_values

    INGREDIENT_STOPWORDS = cleaned

    phrases: Set[str] = set()
    for lang in _build_preferred_languages():
        phrases.update(INGREDIENT_STOPWORDS.get(lang.lower(), set()))
    STOPWORD_PHRASES = sorted(phrases, key=len, reverse=True)
    STOPWORD_PATTERNS = [re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE) for phrase in STOPWORD_PHRASES]


_set_stopwords(None)


def _is_stopword(token: str) -> bool:
    norm = normalize_token(token)
    if not norm:
        return False
    for lang in _build_preferred_languages():
        if norm in INGREDIENT_STOPWORDS.get(lang, set()):
            return True
    return False


def _split_on_stopwords(chunk: str) -> List[str]:
    if not chunk or not STOPWORD_PATTERNS:
        return [chunk]
    temp = chunk
    for pattern in STOPWORD_PATTERNS:
        temp = pattern.sub(",", temp)
    return [part.strip() for part in temp.split(",") if part.strip()]


def _ensure_taxonomy() -> Optional[IngredientTaxonomy]:
    global INGREDIENT_TAXONOMY, INGREDIENT_TAXONOMY_ERROR
    if INGREDIENT_TAXONOMY is not None:
        return INGREDIENT_TAXONOMY

    errors: List[str] = []

    if OFF_TAXONOMY_PATH:
        try:
            taxonomy = IngredientTaxonomy(OFF_TAXONOMY_PATH)
            _set_stopwords(taxonomy.stopwords)
            INGREDIENT_TAXONOMY = taxonomy
            return taxonomy
        except Exception as exc:
            errors.append(f"local:{exc}")

    if errors:
        INGREDIENT_TAXONOMY_ERROR = "; ".join(errors)
    return None


def _ensure_additives_taxonomy() -> Optional[IngredientTaxonomy]:
    global ADDITIVES_TAXONOMY, ADDITIVES_TAXONOMY_ERROR
    if ADDITIVES_TAXONOMY is not None:
        return ADDITIVES_TAXONOMY

    if not OFF_ADDITIVES_PATH:
        return None

    try:
        taxonomy = IngredientTaxonomy(OFF_ADDITIVES_PATH)
        ADDITIVES_TAXONOMY = taxonomy
        return taxonomy
    except Exception as exc:
        ADDITIVES_TAXONOMY_ERROR = str(exc)
        return None


def _ensure_normalizer() -> IngredientNormalizer:
    global INGREDIENT_NORMALIZER
    if INGREDIENT_NORMALIZER is None:
        taxonomy = _ensure_taxonomy()
        additives = _ensure_additives_taxonomy()
        INGREDIENT_NORMALIZER = IngredientNormalizer(taxonomy, additives)
    return INGREDIENT_NORMALIZER


# --- Dataset helpers -----------------------------------------------------

def _get_off_product_dataset():
    global OFF_DATASET_ERROR
    if not OFF_DATASET_AVAILABLE:
        if OFF_DATASET_ERROR is None:
            OFF_DATASET_ERROR = "openfoodfacts ProductDataset not available"
        return None

    dataset = getattr(_get_off_product_dataset, "_dataset", None)
    if dataset is not None:
        return dataset

    kwargs: Dict[str, Any] = {"dataset_type": OFF_DATASET_TYPE}
    if OFF_DATASET_FIELDS:
        kwargs["fields"] = OFF_DATASET_FIELDS
    try:
        dataset = ProductDataset(**kwargs)
        setattr(_get_off_product_dataset, "_dataset", dataset)
        setattr(_get_off_product_dataset, "_iterator", iter(dataset))
        return dataset
    except Exception as exc:
        OFF_DATASET_ERROR = str(exc)
        setattr(_get_off_product_dataset, "_dataset", None)
        setattr(_get_off_product_dataset, "_iterator", None)
        return None


def off_dataset_lookup(barcode: str) -> Optional[Dict[str, Any]]:
    global OFF_DATASET_SCANNED
    barcode = (barcode or "").strip()
    if not barcode:
        return None
    if barcode in OFF_DATASET_CACHE:
        return OFF_DATASET_CACHE[barcode]

    dataset = _get_off_product_dataset()
    if dataset is None:
        return None

    iterator = getattr(_get_off_product_dataset, "_iterator", None)
    if iterator is None:
        try:
            iterator = iter(dataset)
            setattr(_get_off_product_dataset, "_iterator", iterator)
        except TypeError:
            iterator = None

    while iterator and OFF_DATASET_SCANNED < OFF_DATASET_MAX_SCAN:
        try:
            product = next(iterator)
        except StopIteration:
            setattr(_get_off_product_dataset, "_iterator", None)
            break
        except Exception:
            setattr(_get_off_product_dataset, "_iterator", None)
            break

        OFF_DATASET_SCANNED += 1
        if not isinstance(product, dict):
            continue
        code = str(product.get("code") or product.get("id") or "").strip()
        if not code:
            continue
        OFF_DATASET_CACHE.setdefault(code, product)
        if code == barcode:
            return product

    return OFF_DATASET_CACHE.get(barcode)


def _extract_product_fields(product: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Optional[List[str]]]:
    if not isinstance(product, dict):
        return None, None, None

    name: Optional[str] = None
    for key in (
        f"product_name_{OFF_DEFAULT_LANGUAGE}",
        "product_name",
        "product_name_en",
        "generic_name",
    ):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            name = value.strip()
            break
    if not name and isinstance(product.get("product_name_locales"), dict):
        locales = product["product_name_locales"]
        for lang in _build_preferred_languages():
            value = locales.get(lang)
            if isinstance(value, str) and value.strip():
                name = value.strip()
                break

    ingredients_text: Optional[str] = None
    for key in (
        f"ingredients_text_{OFF_DEFAULT_LANGUAGE}",
        "ingredients_text",
        "ingredients_text_en",
        "ingredients_text_raw",
    ):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            ingredients_text = value.strip()
            break
        if isinstance(value, list):
            parts = []
            for item in value:
                if isinstance(item, dict):
                    txt = item.get("text") or item.get("id")
                else:
                    txt = str(item)
                if txt:
                    parts.append(str(txt))
            if parts:
                ingredients_text = ", ".join(parts)
                break

    ingredients_tags: Optional[List[str]] = None
    tags_value = product.get("ingredients_tags") or product.get("ingredients_tags_en")
    if isinstance(tags_value, list):
        ingredients_tags = [str(tag) for tag in tags_value if tag]
    elif isinstance(tags_value, str):
        ingredients_tags = [part.strip() for part in tags_value.split(",") if part.strip()]

    return name, ingredients_text, ingredients_tags


# --- Ingredient processing ------------------------------------------------

NORMALIZER = _ensure_normalizer()
FORBIDDEN_NORMALIZED = {normalize_token(token) for token in FORBIDDEN_INGREDIENTS}
FLAG_CANONICALS = {normalize_token(flag.split(":", 1)[-1]) for flag in DEFAULT_FLAG_IDS}


def _diet_tokens(ids: Iterable[str]) -> Set[str]:
    tokens: Set[str] = set()
    for identifier in ids:
        if not identifier:
            continue
        lowered = identifier.lower()
        tokens.add(lowered)
        tokens.add(normalize_token(lowered.split(":", 1)[-1]))
    return {token for token in tokens if token}


def _expand_taxonomy_ids(seed_ids: Iterable[str]) -> Set[str]:
    normalizer = NORMALIZER or _ensure_normalizer()
    taxonomy = normalizer.taxonomy
    if not taxonomy:
        return set(seed_ids)

    children: Dict[str, Set[str]] = defaultdict(set)
    for node_id, node in taxonomy.nodes.items():
        for parent_id in node.parent_ids:
            children[parent_id].add(node_id)

    result: Set[str] = set()
    queue = deque()
    for identifier in seed_ids:
        if not identifier:
            continue
        canonical = identifier if ':' in identifier else f'en:{identifier}'
        queue.append(canonical)

    while queue:
        current = queue.popleft()
        if current in result:
            continue
        result.add(current)
        for child in children.get(current, ()):  # type: ignore[arg-type]
            queue.append(child)

    return result


_DIET_RULE_CACHE: Optional[Dict[str, Dict[str, Set[str]]]] = None


DIET_FALLBACK_TOKENS: Dict[str, Set[str]] = {
    "vegetarian": {
        "beef",
        "chicken",
        "duck",
        "fish",
        "goat",
        "ham",
        "lamb",
        "meat",
        "mutton",
        "pork",
        "prawn",
        "salami",
        "sausage",
        "seafood",
        "shellfish",
        "shrimp",
        "turkey",
    },
    "vegan": {
        "butter",
        "casein",
        "cheese",
        "cream",
        "egg",
        "gelatin",
        "ghee",
        "honey",
        "lactose",
        "milk",
        "whey",
    },
    "jain": {
        "garlic",
        "ginger",
        "onion",
        "potato",
        "radish",
        "root vegetable",
        "root vegetables",
        "tuber",
    },
}


ALLERGY_FALLBACK_TOKENS: Dict[str, Set[str]] = {
    "gluten": {
        "gluten",
        "wheat",
        "barley",
        "rye",
        "spelt",
        "durum",
        "farina",
        "semolina",
        "triticale",
        "malt",
        "graham",
        "bulgur",
    },
    "dairy": {
        "dairy",
        "milk",
        "butter",
        "cheese",
        "cream",
        "casein",
        "whey",
        "lactose",
        "ghee",
        "yogurt",
        "yoghurt",
        "curd",
        "paneer",
        "dahi"
    },
    "nuts": {
        "nut",
        "nuts",
        "tree nut",
        "peanut",
        "almond",
        "cashew",
        "hazelnut",
        "pecan",
        "pistachio",
        "walnut",
        "macadamia",
        "brazil nut",
        "pine nut",
    },
    "soy": {
        "soy",
        "soya",
        "soybean",
        "soy bean",
        "edamame",
        "tofu",
        "tempeh",
        "miso",
    },
    "eggs": {
        "egg",
        "eggs",
        "albumen",
        "albumin",
        "egg white",
        "egg yolk",
        "ovalbumin",
        "ovomucoid",
    },
    "shellfish": {
        "shellfish",
        "crab",
        "lobster",
        "shrimp",
        "prawn",
        "crayfish",
        "krill",
        "langoustine",
        "mussel",
        "clam",
        "oyster",
        "scallop",
        "whelk",
    },
    "fish": {
        "fish",
        "anchovy",
        "cod",
        "haddock",
        "pollock",
        "salmon",
        "sardine",
        "tilapia",
        "trout",
        "tuna",
        "mackerel",
    },
    "sesame": {
        "sesame",
        "sesame seed",
        "tahini",
        "benne",
    },
}


def _normalize_taxonomy_id(identifier: Optional[Any]) -> Optional[str]:
    if not identifier:
        return None
    if not isinstance(identifier, str):
        identifier = str(identifier)
    cleaned = identifier.strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    if ':' not in lowered:
        lowered = f'en:{lowered}'
    return lowered


def _tokens_from_ids(ids: Iterable[str]) -> Set[str]:
    tokens: Set[str] = set()
    for identifier in ids:
        if not identifier:
            continue
        suffix = identifier.split(':', 1)[-1]
        token = normalize_token(suffix)
        if token:
            tokens.add(token)
    return tokens


def _normalize_allergy_preferences(values: Iterable[Any]) -> Tuple[List[str], Set[str]]:
    labels: List[str] = []
    label_tracker: Set[str] = set()
    tokens: Set[str] = set()

    for entry in values:
        if entry is None:
            continue
        text = entry if isinstance(entry, str) else str(entry)
        if not text:
            continue
        label = text.strip()
        if not label:
            continue
        normalized = normalize_token(label)
        if not normalized:
            continue
        lowered_label = label.lower()
        if lowered_label not in label_tracker:
            labels.append(label)
            label_tracker.add(lowered_label)
        tokens.add(normalized)
        fallback = ALLERGY_FALLBACK_TOKENS.get(normalized)
        if fallback:
            for alias in fallback:
                alias_norm = normalize_token(alias)
                if alias_norm:
                    tokens.add(alias_norm)
    return labels, tokens


def _build_diet_rules() -> Dict[str, Dict[str, Set[str]]]:
    seeds: Dict[str, Iterable[str]] = {
        "vegetarian": [
            "en:meat",
            "en:fish",
            "en:seafood",
            "en:gelatin",
            "en:lard",
            "en:animal-fat",
            "en:animal-enzymes",
        ],
        "vegan": [
            "en:meat",
            "en:fish",
            "en:seafood",
            "en:gelatin",
            "en:lard",
            "en:animal-fat",
            "en:animal-enzymes",
            "en:egg",
            "en:milk",
            "en:dairy",
            "en:honey",
            "en:whey",
        ],
        "jain": [
            "en:meat",
            "en:fish",
            "en:seafood",
            "en:egg",
            "en:honey",
            "en:root-vegetables",
            "en:garlic",
            "en:onion",
        ],
    }

    rules: Dict[str, Dict[str, Set[str]]] = {}
    for key, value in seeds.items():
        expanded = _expand_taxonomy_ids(value)
        tokens = _tokens_from_ids(expanded)
        fallback_tokens: Set[str] = set(DIET_FALLBACK_TOKENS.get(key, set()))
        if key in {"vegan", "jain"}:
            fallback_tokens.update(DIET_FALLBACK_TOKENS.get("vegetarian", set()))
        for fallback in fallback_tokens:
            normalized = normalize_token(fallback)
            if not normalized:
                continue
            tokens.add(normalized)
            norm_id = _normalize_taxonomy_id(fallback)
            if norm_id:
                expanded.add(norm_id)
        rules[key] = {
            "ids": expanded,
            "tokens": tokens,
        }
    return rules


def _get_diet_rules() -> Dict[str, Dict[str, Set[str]]]:
    global _DIET_RULE_CACHE
    if _DIET_RULE_CACHE is None:
        _DIET_RULE_CACHE = _build_diet_rules()
    return _DIET_RULE_CACHE


def _collect_diet_signatures(item: NormalizedIngredient) -> Tuple[Set[str], Set[str]]:
    ids: Set[str] = set()
    tokens: Set[str] = set()
    info = item.taxonomy or {}

    def _add_identifier(identifier: Optional[str]) -> None:
        norm_id = _normalize_taxonomy_id(identifier)
        if norm_id:
            ids.add(norm_id)
            suffix = norm_id.split(':', 1)[-1]
            token = normalize_token(suffix)
            if token:
                tokens.add(token)

    _add_identifier(info.get("id"))
    for parent in info.get("parents") or []:
        _add_identifier(parent)

    for surface in (item.canonical, item.token, item.display):
        token = normalize_token(surface)
        if token:
            tokens.add(token)

    return ids, tokens


def process_ingredients(text: str, preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    normalizer = NORMALIZER or _ensure_normalizer()
    items = normalizer.normalize(text)
    diet_pref = None
    diet_rules = _get_diet_rules()
    allergy_tokens: Set[str] = set()
    allergy_labels: List[str] = []
    if preferences and isinstance(preferences, dict):
        raw_diet = preferences.get("diet")
        if isinstance(raw_diet, str):
            lowered = raw_diet.lower().strip()
            if lowered in diet_rules:
                diet_pref = lowered
        raw_allergies = preferences.get("allergies")
        if isinstance(raw_allergies, (list, tuple, set)):
            labels, tokens = _normalize_allergy_preferences(raw_allergies)
            allergy_labels = labels
            allergy_tokens = tokens

    is_clean, hits, diet_hits, allergy_hits = evaluate_items(items, diet_pref, allergy_tokens)
    display = [item.display for item in items]
    canonical = [item.canonical for item in items]
    taxonomy = [item.taxonomy for item in items if item.taxonomy]
    if normalizer.taxonomy and normalizer.additives:
        source_label = "taxonomy+additives"
    elif normalizer.taxonomy:
        source_label = "taxonomy"
    elif normalizer.additives:
        source_label = "additives"
    else:
        source_label = "heuristic"
    return {
        "source": source_label,
        "ingredients": display,
        "canonical": canonical,
        "taxonomy": taxonomy,
        "is_clean": is_clean,
        "hits": hits,
        "diet_hits": diet_hits,
        "diet_preference": diet_pref,
        "allergy_hits": allergy_hits,
        "allergy_preferences": allergy_labels,
        "taxonomy_error": INGREDIENT_TAXONOMY_ERROR,
        "additives_error": ADDITIVES_TAXONOMY_ERROR,
    }


def evaluate_items(
    items: List[NormalizedIngredient],
    diet_preference: Optional[str] = None,
    allergy_tokens: Optional[Set[str]] = None,
) -> Tuple[bool, List[str], List[str], List[str]]:
    hits: Set[str] = set()
    diet_hits: List[str] = []
    seen_diet: Set[str] = set()
    allergy_hits: List[str] = []
    seen_allergies: Set[str] = set()
    diet_rules = _get_diet_rules()
    rule: Optional[Dict[str, Set[str]]] = None
    id_rule: Set[str] = set()
    token_rule: Set[str] = set()
    allergy_token_set: Set[str] = set(allergy_tokens or set())
    if diet_preference:
        possible_rule = diet_rules.get(diet_preference)
        if possible_rule:
            rule = possible_rule
            id_rule = set(possible_rule.get("ids", set()))
            token_rule = set(possible_rule.get("tokens", set()))
    for item in items:
        token = item.canonical.replace("-", " ")
        for forbidden in FORBIDDEN_NORMALIZED:
            if forbidden and forbidden in token:
                hits.add(forbidden)
        info = item.taxonomy or {}
        display_norm = normalize_token(info.get("display") or item.display)
        if display_norm in FORBIDDEN_NORMALIZED:
            hits.add(display_norm)
        for syn in info.get("synonyms") or []:
            syn_norm = normalize_token(syn)
            if syn_norm in FORBIDDEN_NORMALIZED:
                hits.add(syn_norm)
        node_id = info.get("id") if isinstance(info, dict) else None
        if node_id and (node_id in DEFAULT_FLAG_IDS or normalize_token(node_id.split(":", 1)[-1]) in FLAG_CANONICALS):
            hits.add(display_norm or token)
        item_ids, item_tokens = _collect_diet_signatures(item)
        if rule:
            has_conflict = bool(item_ids & id_rule) or bool(item_tokens & token_rule)
            if has_conflict:
                normalized_display = (item.display or item.canonical).strip()
                if normalized_display and normalized_display.lower() not in seen_diet:
                    seen_diet.add(normalized_display.lower())
                    diet_hits.append(normalized_display)
        if allergy_token_set:
            combined_tokens: Set[str] = set(item_tokens)
            for identifier in item_ids:
                suffix = identifier.split(":", 1)[-1]
                norm_suffix = normalize_token(suffix)
                if norm_suffix:
                    combined_tokens.add(norm_suffix)
            if combined_tokens & allergy_token_set:
                normalized_display = (item.display or item.canonical).strip()
                if normalized_display:
                    lowered_display = normalized_display.lower()
                    if lowered_display not in seen_allergies:
                        seen_allergies.add(lowered_display)
                        allergy_hits.append(normalized_display)
    return (len(hits) == 0), sorted(hits), diet_hits, allergy_hits


# --- HTTP helpers --------------------------------------------------------

def load_template() -> str:
    with TEMPLATE_PATH.open("r", encoding="utf-8") as handle:
        return handle.read()


def build_check_payload(raw_text: str, preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    analysis = process_ingredients(raw_text, preferences)
    display_items = analysis["ingredients"]
    taxonomy_entries = analysis["taxonomy"]
    hits = analysis["hits"]
    is_clean = analysis["is_clean"]
    diet_hits = analysis.get("diet_hits") or []
    diet_preference = analysis.get("diet_preference")
    diet_label = (diet_preference or "").replace("_", " ").strip().title()
    allergy_hits = analysis.get("allergy_hits") or []
    allergy_preferences = analysis.get("allergy_preferences") or []

    safe_input = html.escape(raw_text)
    display_list = "".join(f"<li>{html.escape(item)}</li>" for item in display_items) or "<li>—</li>"
    summary_sections: List[str] = []
    if is_clean:
        summary_sections.append(
            textwrap.dedent(
                """        <div class=\"card ok\">
          <h2>✅ Clean</h2>
          <p>No red-flag additives detected.</p>
        </div>
        """
            )
        )
    else:
        flagged = "".join(f"<li>{html.escape(hit)}</li>" for hit in hits)
        summary_sections.append(
            textwrap.dedent(
                f"""        <div class=\"card bad\">
          <h2>❌ Not Clean</h2>
          <p>Found these flagged ingredients:</p>
          <ul>{flagged}</ul>
        </div>
        """
            )
        )

    if diet_hits:
        flagged_diet = "".join(f"<li>{html.escape(hit)}</li>" for hit in diet_hits)
        diet_heading = html.escape(diet_label or "your diet")
        summary_sections.append(
            textwrap.dedent(
                f"""        <div class=\"card bad\">
          <h2>⚠️ Conflicts with {diet_heading}</h2>
          <p>This product conflicts with your dietary preference.</p>
          <ul>{flagged_diet}</ul>
        </div>
        """
            )
        )

    if allergy_hits:
        flagged_allergies = "".join(f"<li>{html.escape(hit)}</li>" for hit in allergy_hits)
        if allergy_preferences:
            preference_label = ", ".join(html.escape(pref) for pref in allergy_preferences)
        else:
            preference_label = "your allergy selections"
        summary_sections.append(
            textwrap.dedent(
                f"""        <div class=\"card bad\">
          <h2>⚠️ Matches {preference_label}</h2>
          <p>These ingredients match the allergies or sensitivities you track:</p>
          <ul>{flagged_allergies}</ul>
        </div>
        """
            )
        )

    summary_block = "".join(summary_sections)

    taxonomy_items = []
    for entry in taxonomy_entries:
        if not entry:
            continue
        label = html.escape(entry.get("display") or "")
        details: List[str] = []
        parents = entry.get("parents") or []
        if parents:
            details.append("Parents: " + " › ".join(html.escape(p) for p in parents[:3]))
        synonyms = entry.get("synonyms") or []
        if synonyms:
            details.append("Synonyms: " + ", ".join(html.escape(s) for s in synonyms[:5]))
        if details:
            taxonomy_items.append(f"<li>{label} <span class=\"muted\">({' • '.join(details)})</span></li>")
        else:
            taxonomy_items.append(f"<li>{label}</li>")

    taxonomy_block = ""
    if taxonomy_items:
        taxonomy_block = textwrap.dedent(
            f"""          <p><strong>Open Food Facts taxonomy:</strong></p>
          <ul class=\"bullets\">{''.join(taxonomy_items)}</ul>
            """
        )

    taxonomy_notice = ""
    taxonomy_error = analysis.get("taxonomy_error")
    if taxonomy_error:
        taxonomy_notice = f"<p class=\"small muted\">Taxonomy unavailable: {html.escape(taxonomy_error)}</p>"

    analysis_block = textwrap.dedent(
        f"""        <details class=\"analysis\" open>
          <summary>Analysis</summary>
          <p><strong>Your input:</strong></p>
          <pre class=\"input\">{safe_input}</pre>
          <p><strong>Parsed ingredients:</strong></p>
          <ul class=\"bullets\">{display_list}</ul>{taxonomy_block}
          {taxonomy_notice}
        </details>
        """
    )

    return {
        "html": summary_block + analysis_block,
        "is_clean": is_clean,
        "hits": hits,
        "analysis": analysis,
        "raw_input": raw_text,
    }


def _respond_json(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _respond_html(handler: BaseHTTPRequestHandler, status: int, html_body: str) -> None:
    body = html_body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _serve_file(handler: BaseHTTPRequestHandler, path: Path, default_mime: str = "application/octet-stream") -> None:
    mime, _ = mimetypes.guess_type(str(path))
    if not mime:
        mime = default_mime
    data = path.read_bytes()
    handler.send_response(200)
    if mime.startswith("text/") or mime in {"application/javascript", "application/json"}:
        handler.send_header("Content-Type", f"{mime}; charset=utf-8")
    else:
        handler.send_header("Content-Type", mime)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def _read_body(handler: BaseHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return b""
    return handler.rfile.read(length)


def _parse_json_body(handler: BaseHTTPRequestHandler) -> Tuple[Optional[Any], Optional[str]]:
    body = _read_body(handler)
    if not body:
        return {}, None
    try:
        return json.loads(body.decode("utf-8")), None
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return None, str(exc)


def build_capabilities() -> Dict[str, Any]:
    dataset_info = {
        "available": OFF_DATASET_AVAILABLE,
        "error": OFF_DATASET_ERROR,
        "type": OFF_DATASET_TYPE,
        "fields": OFF_DATASET_FIELDS,
        "max_scan": OFF_DATASET_MAX_SCAN,
        "scanned": OFF_DATASET_SCANNED,
        "cache_size": len(OFF_DATASET_CACHE),
    }

    taxonomy_info = {
        "path": OFF_TAXONOMY_PATH,
        "loaded": INGREDIENT_TAXONOMY is not None,
        "error": INGREDIENT_TAXONOMY_ERROR,
    }

    additives_info = {
        "path": OFF_ADDITIVES_PATH,
        "loaded": ADDITIVES_TAXONOMY is not None,
        "error": ADDITIVES_TAXONOMY_ERROR,
    }

    frontend_info = {
        "revamped_root": str(REVAMPED_ROOT) if REVAMPED_AVAILABLE else None,
        "available": REVAMPED_AVAILABLE,
        "error": REVAMPED_ERROR,
    }

    return {
        "ocr": {
            "server": PYTESSERACT_AVAILABLE,
            "preprocessing": OPENCV_AVAILABLE,
        },
        "taxonomy": taxonomy_info,
        "additives": additives_info,
        "frontend": frontend_info,
        "off_sdk": False,
        "dataset": dataset_info,
    }


# --- HTTP handler --------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - signature fixed by BaseHTTPRequestHandler
        if self.path.startswith("/capabilities"):
            _respond_json(self, 200, build_capabilities())
            return

        if REVAMPED_AVAILABLE and self._serve_revamped():
            return

        if self.path in {"/", "/index.html"}:
            try:
                page = load_template().replace("{{result_html}}", "")
            except FileNotFoundError:
                self.send_error(500, "Template not found")
                return
            _respond_html(self, 200, page)
            return

        self.send_error(404, "Not Found")

    def do_POST(self) -> None:  # noqa: N802 - signature fixed by BaseHTTPRequestHandler
        if self.path.startswith("/check"):
            self._handle_check()
            return
        if self.path.startswith("/ocr"):
            self._handle_ocr()
            return
        if self.path.startswith("/lookup"):
            self._handle_lookup()
            return
        if self.path.startswith("/parse_ingredients"):
            self._handle_parse()
            return
        self.send_error(404, "Not Found")

    def _serve_revamped(self) -> bool:
        path = self.path.split("?", 1)[0]
        if not path:
            path = "/"

        if path.startswith(("/check", "/lookup", "/ocr", "/parse_ingredients")):
            return False

        if path.startswith("/api/") or path.startswith("/__"):
            return False

        if path.startswith("/assets/"):
            asset_path = REVAMPED_ROOT / path.lstrip("/")
            if asset_path.is_file():
                _serve_file(self, asset_path)
                return True
            return False

        if path in {"/", "/index.html"}:
            if REVAMPED_INDEX.is_file():
                _serve_file(self, REVAMPED_INDEX, default_mime="text/html")
                return True
            return False

        candidate = REVAMPED_ROOT / path.lstrip("/")
        if candidate.is_file():
            _serve_file(self, candidate)
            return True

        # SPA-style fallback: serve index for unknown routes
        if REVAMPED_INDEX.is_file() and not path.startswith("/capabilities"):
            _serve_file(self, REVAMPED_INDEX, default_mime="text/html")
            return True

        return False

    # -- Endpoint handlers --
    def _handle_check(self) -> None:
        try:
            form_body = _read_body(self).decode("utf-8", errors="ignore")
            params = urllib.parse.parse_qs(form_body)
            text = params.get("ingredients", [""])[0]
            preferences_raw = params.get("preferences", [None])[0]
            preferences_obj: Optional[Dict[str, Any]] = None
            if preferences_raw:
                try:
                    parsed_pref = json.loads(preferences_raw)
                    if isinstance(parsed_pref, dict):
                        preferences_obj = parsed_pref
                except json.JSONDecodeError:
                    preferences_obj = None
            payload = build_check_payload(text, preferences_obj)
            accept = (self.headers.get("Accept") or "").lower()
            wants_json = "application/json" in accept or (self.headers.get("X-Requested-With") or "").lower() in {"xmlhttprequest", "fetch"}
            if wants_json:
                response = {
                    "html": payload["html"],
                    "analysis": payload["analysis"],
                    "hits": payload["hits"],
                    "is_clean": payload["is_clean"],
                    "diet_hits": payload["analysis"].get("diet_hits"),
                    "diet_preference": payload["analysis"].get("diet_preference"),
                }
                _respond_json(self, 200, response)
            else:
                try:
                    page = load_template().replace("{{result_html}}", payload["html"])
                except FileNotFoundError:
                    self.send_error(500, "Template not found")
                    return
                _respond_html(self, 200, page)
        except Exception as exc:  # pragma: no cover - defensive
            traceback.print_exc()
            _respond_json(self, 500, {"error": str(exc)})

    def _handle_parse(self) -> None:
        payload, error = _parse_json_body(self)
        if error is not None:
            _respond_json(self, 400, {"error": "invalid json body"})
            return

        if not isinstance(payload, dict):
            _respond_json(self, 400, {"error": "invalid json payload"})
            return

        text = str(payload.get("text", ""))
        if not text:
            _respond_json(self, 400, {"error": "missing text"})
            return

        preferences_obj = None
        preferences_payload = payload.get("preferences")
        if isinstance(preferences_payload, dict):
            preferences_obj = preferences_payload

        analysis = process_ingredients(text, preferences_obj)
        response = {
            "ingredients": analysis["ingredients"],
            "canonical": analysis["canonical"],
            "taxonomy": analysis["taxonomy"],
            "source": analysis["source"],
            "is_clean": analysis["is_clean"],
            "hits": analysis["hits"],
            "diet_hits": analysis.get("diet_hits"),
            "diet_preference": analysis.get("diet_preference"),
            "taxonomy_error": analysis.get("taxonomy_error"),
            "additives_error": analysis.get("additives_error"),
        }
        _respond_json(self, 200, response)

    def _handle_ocr(self) -> None:
        payload, error = _parse_json_body(self)
        if error is not None:
            _respond_json(self, 400, {"error": "invalid json body"})
            return

        if not isinstance(payload, dict):
            _respond_json(self, 400, {"error": "invalid json payload"})
            return

        data_url = str(payload.get("image_data") or "")
        use_opencv = bool(payload.get("use_opencv"))
        if not data_url:
            _respond_json(self, 400, {"error": "missing image_data"})
            return

        if use_opencv and not OPENCV_AVAILABLE:
            _respond_json(self, 400, {"error": "OpenCV preprocessing not available"})
            return

        comma = data_url.find(",")
        base64_data = data_url[comma + 1 :] if comma != -1 else data_url
        try:
            image_bytes = base64.b64decode(base64_data)
        except Exception:
            _respond_json(self, 400, {"error": "invalid base64 image data"})
            return

        pil_image: Optional[Image.Image] = None
        if use_opencv and OPENCV_AVAILABLE:
            try:
                pil_image = preprocess_image_opencv(image_bytes)
            except Exception:
                traceback.print_exc()
                pil_image = None
        if pil_image is None:
            try:
                pil_image = preprocess_image_bytes(image_bytes)
            except Exception:
                traceback.print_exc()
                _respond_json(self, 400, {"error": "failed to decode/process image"})
                return

        if not PYTESSERACT_AVAILABLE:
            _respond_json(self, 501, {"error": "Server OCR not configured"})
            return

        try:
            text = pytesseract.image_to_string(pil_image, lang="eng")
        except Exception as exc:
            traceback.print_exc()
            _respond_json(self, 500, {"error": f"Server OCR failed: {exc}"})
            return

        _respond_json(self, 200, {"text": text})

    def _handle_lookup(self) -> None:
        payload, error = _parse_json_body(self)
        if error is not None:
            _respond_json(self, 400, {"error": "Invalid JSON body"})
            return

        if not isinstance(payload, dict):
            _respond_json(self, 400, {"error": "Invalid JSON payload"})
            return

        barcode = str(payload.get("barcode", "")).strip()
        if not barcode:
            _respond_json(self, 400, {"error": "No barcode provided"})
            return

        preferences_payload = payload.get("preferences")
        preferences_obj = preferences_payload if isinstance(preferences_payload, dict) else None

        dataset_info = {
            "available": OFF_DATASET_AVAILABLE,
            "used": False,
            "error": OFF_DATASET_ERROR,
            "type": OFF_DATASET_TYPE,
            "scanned": OFF_DATASET_SCANNED,
            "max_scan": OFF_DATASET_MAX_SCAN,
            "cache_size": len(OFF_DATASET_CACHE),
        }
        product_info: Dict[str, Any] = {
            "barcode": barcode,
            "product_name": None,
            "ingredients": None,
            "ingredients_tags": None,
            "lookup": {"source": None, "dataset": dataset_info, "hits": []},
        }

        dataset_product = off_dataset_lookup(barcode) if OFF_DATASET_AVAILABLE else None
        dataset_info.update({
            "used": bool(dataset_product),
            "error": OFF_DATASET_ERROR,
            "scanned": OFF_DATASET_SCANNED,
            "cache_size": len(OFF_DATASET_CACHE),
        })

        if dataset_product:
            name, text_value, tags = _extract_product_fields(dataset_product)
            if name:
                product_info["product_name"] = name
            if text_value:
                product_info["ingredients"] = text_value
                product_info["lookup"]["source"] = "dataset"
            if tags:
                product_info["ingredients_tags"] = tags

        if not product_info["ingredients"]:
            try:
                product_info = self._lookup_via_api(barcode, product_info)
            except urllib.error.HTTPError as exc:
                _respond_json(self, 404 if exc.code == 404 else 502, {
                    "error": "Product not found" if exc.code == 404 else f"OpenFoodFacts HTTP error: {exc.code}",
                    "lookup": product_info.get("lookup", {}),
                })
                return
            except Exception as exc:
                _respond_json(self, 502, {"error": f"Failed to contact OpenFoodFacts: {exc}", "lookup": product_info.get("lookup", {})})
                return

        ingredients_text = product_info.get("ingredients") or ""
        if ingredients_text:
            analysis = process_ingredients(ingredients_text, preferences_obj)
            product_info.update(
                {
                    "analysis": analysis,
                    "is_clean": analysis["is_clean"],
                    "hits": analysis["hits"],
                    "diet_hits": analysis.get("diet_hits"),
                    "diet_preference": analysis.get("diet_preference"),
                }
            )
        else:
            product_info.update({"analysis": None, "is_clean": True, "hits": []})

        _respond_json(self, 200, product_info)

    def _lookup_via_api(self, barcode: str, product_info: Dict[str, Any]) -> Dict[str, Any]:
        url = f"https://world.openfoodfacts.org/api/v2/product/{urllib.parse.quote(barcode)}"
        http_meta = {"used": False, "url": url, "status": None}
        product_info["lookup"]["http"] = http_meta
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CleanFoodChecker/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.load(resp)
        except urllib.error.HTTPError as exc:
            http_meta.update({"used": True, "status": exc.code})
            raise
        except Exception as exc:
            http_meta.update({"used": True, "status": "error"})
            raise exc

        http_meta.update({"used": True, "status": data.get("status")})
        if data.get("status") != 1:
            return product_info

        product = data.get("product", {}) or {}
        name, text_value, tags = _extract_product_fields(product)
        if name:
            product_info["product_name"] = name
        if text_value:
            product_info["ingredients"] = text_value
            product_info["lookup"]["source"] = "http"
        if tags:
            product_info["ingredients_tags"] = tags
        return product_info


# --- OCR helpers ---------------------------------------------------------


def preprocess_image_bytes(image_bytes: bytes, max_dim: int = 1600, contrast: float = 1.4) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    scale = 1.0
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
    if scale != 1.0:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img = img.convert("L")
    if contrast and contrast != 1.0:
        try:
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(contrast)
        except Exception:
            pass
    try:
        img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=3))
    except Exception:
        pass
    return img


def preprocess_image_opencv(image_bytes: bytes, max_dim: int = 1600) -> Image.Image:
    if not OPENCV_AVAILABLE:
        raise RuntimeError("OpenCV not available")
    img = Image.open(io.BytesIO(image_bytes))
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")
    arr = np.array(img)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    scale = 1.0
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
    if scale != 1.0:
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    try:
        gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    except Exception:
        pass
    try:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
    except Exception:
        pass
    try:
        gray = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 8)
    except Exception:
        try:
            _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        except Exception:
            pass
    return Image.fromarray(gray)


# --- Entry point ---------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Clean Food Checker server")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default 8000)")
    args = parser.parse_args()

    # Ensure taxonomy is loaded at startup (errors recorded for capabilities endpoint)
    try:
        _ensure_taxonomy()
    except Exception as exc:
        global INGREDIENT_TAXONOMY_ERROR
        INGREDIENT_TAXONOMY_ERROR = str(exc)

    server = HTTPServer(("0.0.0.0", args.port), Handler)
    print(f"Serving on http://localhost:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":  # pragma: no cover
    main()
