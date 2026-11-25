#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Delad Cloudflare D1-klient för alla sync-/export-/verify-skript.

Ett enda ställe för auth, URL-bygge och felhantering mot D1:s HTTP-API, så att
inte varje skript återimplementerar samma POST-logik (och riskerar att driva
isär i variabelnamn och felhantering).

Konfigurationen läses ur processmiljön; ingen fil läses här. Sätt variablerna
i skalet som kör skriptet. quarterly_refresh.sh läser in en env-fil först om
QUILL_ENV_FILE pekar på en. Tokenet behöver bara D1-behörigheten Edit.

  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  D1_DATABASE_UUID                 (alias: D1_DATABASE_ID)
"""
from __future__ import annotations

import os
import re
import sys
from urllib.parse import quote

import requests


def _env(*names: str) -> str:
    # strip(): värden som klistras in i GitHubs variabel-/secret-fält eller i en
    # .env får lätt med sig en radbrytning. Den överlever in i URL:en som %0D%0A
    # och ger ett 400 från Cloudflare som inte säger något om vad som är fel.
    for n in names:
        val = os.environ.get(n)
        if val and val.strip():
            return val.strip()
    sys.exit(f"FEL: sätt en av miljövariablerna: {', '.join(names)}")


_ACCOUNT_ID = re.compile(r"[0-9a-fA-F]{32}\Z")
_DATABASE_ID = re.compile(
    r"(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})\Z"
)


def _url_segment(name: str, value: str, pattern: re.Pattern[str]) -> str:
    if not pattern.fullmatch(value):
        raise ValueError(f"FEL: {name} har ogiltigt format")
    return quote(value, safe="")


class D1Client:
    """Tunn wrapper runt D1:s query-endpoint med en återanvänd requests-Session
    (connection pooling för de skript som gör tusentals anrop)."""

    def __init__(self, session: requests.Session | None = None):
        self.account_id = _url_segment(
            "CLOUDFLARE_ACCOUNT_ID", _env("CLOUDFLARE_ACCOUNT_ID"), _ACCOUNT_ID
        )
        self.token = _env("CLOUDFLARE_API_TOKEN")
        self.db = _url_segment(
            "D1_DATABASE_UUID/D1_DATABASE_ID",
            _env("D1_DATABASE_UUID", "D1_DATABASE_ID"),
            _DATABASE_ID,
        )
        self.url = (
            "https://api.cloudflare.com/client/v4/accounts/"
            f"{self.account_id}/d1/database/{self.db}/query"
        )
        self.session = session or requests.Session()
        self.session.headers.update(
            {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        )

    def run(self, sql: str, params: list | None = None, timeout: int = 30) -> dict:
        """Kör en SQL-sats och returnerar hela result[0]-objektet (results + meta).
        Kastar requests.HTTPError vid HTTP-fel och RuntimeError vid D1-fel."""
        # codeql[py/partial-ssrf] -- The host is fixed to api.cloudflare.com; both path segments are validated hex/UUID values.
        resp = self.session.post(
            self.url, json={"sql": sql, "params": params or []}, timeout=timeout
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"D1-fel: {data.get('errors')}")
        return data["result"][0]

    def query(self, sql: str, params: list | None = None, timeout: int = 30) -> list[dict]:
        """Bekvämlighet för SELECT: returnerar bara raderna (result[0]['results'])."""
        return self.run(sql, params, timeout).get("results", [])
