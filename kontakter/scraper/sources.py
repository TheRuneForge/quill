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


def sources_dir() -> Path:
    value = os.environ.get("CONTACT_SOURCES_DIR", "").strip()
    if not value:
        raise SystemExit(
            "CONTACT_SOURCES_DIR är inte satt. Kopiera kontakter/sources.example/ till en "
            "egen katalog utanför repot, fyll i den och peka ut den med CONTACT_SOURCES_DIR."
        )
    # codeql[py/path-injection] CONTACT_SOURCES_DIR is trusted operator configuration for external source files.
    candidate = Path(value).expanduser()
    try:
        root = candidate.resolve(strict=True)
    except OSError as error:
        raise SystemExit("CONTACT_SOURCES_DIR måste peka på en befintlig katalog") from error
    if not root.is_dir():
        raise SystemExit("CONTACT_SOURCES_DIR måste peka på en katalog")
    return root


def load(name: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise SystemExit("Ogiltigt källnamn: endast bokstäver, siffror, bindestreck och understreck tillåts")
    root = sources_dir().resolve()
    path = (root / f"{name}.json").resolve()
    if path.parent != root:
        raise SystemExit("Källfilen måste ligga direkt i CONTACT_SOURCES_DIR")
    if not path.is_file():
        raise SystemExit(f"Källfilen saknas: {path} (se {EXAMPLES / (name + '.json')})")
    return json.loads(path.read_text(encoding="utf-8"))
