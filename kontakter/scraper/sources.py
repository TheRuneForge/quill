"""Var kontaktkällorna finns.

Koden innehåller inga kontaktlistor eller källkataloger. De ligger i JSON-filer i
en egen katalog utanför repot, som pekas ut med miljövariabeln
CONTACT_SOURCES_DIR. Exempel på varje fil finns i kontakter/sources.example/.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

EXAMPLES = Path(__file__).resolve().parent.parent / "sources.example"
REPO_ROOT = Path(__file__).resolve().parents[2]


def sources_dir() -> Path:
    value = os.environ.get("CONTACT_SOURCES_DIR", "").strip()
    if not value:
        raise SystemExit(
            "CONTACT_SOURCES_DIR är inte satt. Kopiera kontakter/sources.example/ till en "
            "egen katalog utanför repot, fyll i den och peka ut den med CONTACT_SOURCES_DIR."
        )
    # codeql[py/path-injection] -- This is an explicit operator-configured source directory.
    # It is canonicalized, checked to exist, and may be inside the repo only for the
    # checked-in examples used by tests; scraped HTTP data never selects this path.
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise SystemExit(f"CONTACT_SOURCES_DIR är inte en katalog: {path}")
    examples = EXAMPLES.resolve()
    if path != examples and path.is_relative_to(REPO_ROOT):
        raise SystemExit("CONTACT_SOURCES_DIR måste ligga utanför repot")
    return path


def load(name: str):
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", name):
        raise ValueError("Ogiltigt källnamn")
    path = sources_dir() / f"{name}.json"
    if not path.is_file():
        raise SystemExit(f"Källfilen saknas: {path} (se {EXAMPLES / (name + '.json')})")
    return json.loads(path.read_text(encoding="utf-8"))
