"""Tiny HTTP client for the CLIs. Sends `Authorization: Bearer $LEDGER_TOKEN`. Logs nothing."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any


def call(
    base_url: str, method: str, path: str, body: Any = None, params: dict | None = None
) -> Any:
    url = base_url.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("LEDGER_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=600) as resp:  # noqa: S310
        return json.loads(resp.read())
