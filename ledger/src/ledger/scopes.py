"""Principals and per-agent scopes (design L6, goal G12). Pure: no HTTP, no I/O but the config.

A principal is a name from LEDGER_TOKEN ("service") or LEDGER_TOKENS (`name:token`). The scope
book says what each principal may see through the read API (`/v1/...` and `/mcp`):

    {"principals": {
        "ultramind": {
            "kinds": ["conversation", "knowledge", "action"],   # or "action:commitment", "*"
            "sensitivity": ["normal"],                          # Sensitivity enum values, or "*"
            "write": false,                                     # correct / forget
            "users": ["user-1"],                                # optional; omitted = any user
            "internal": false                                   # optional; see below
        }}}

Read from LEDGER_SCOPES (inline JSON) or else LEDGER_SCOPES_FILE (a JSON file), on each call
(cached while the text is the same), so a change needs no restart. Fail closed:
- a principal with no entry may not use the read API at all;
- an invalid book denies every principal (logged once, without content);
- a principal WITH an entry is an "agent": it may not use the internal service routes
  (/conversations, /ingest, ...), which bypass scopes, unless `internal: true`.

Per-user tokens later: a principal bound to one user gets `users: [that user]` (or a new
Principal.kind checked in `owner_for`); no route changes.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ledger.schema.life_datatypes import Sensitivity

log = logging.getLogger("ledger.scopes")

ACTION_SUBKINDS = ("task", "commitment", "decision", "constraint")
KIND_CLASSES = frozenset(
    {"*", "conversation", "knowledge", "action", *(f"action:{s}" for s in ACTION_SUBKINDS)}
)
SENSITIVITIES = frozenset({"*", *(s.value for s in Sensitivity)})


@dataclass(frozen=True)
class Principal:
    name: str
    kind: str = "service"  # service | agent


class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kinds: frozenset[str] = Field(default_factory=frozenset)
    sensitivity: frozenset[str] = Field(default_factory=frozenset)
    write: bool = False
    users: frozenset[str] | None = None
    internal: bool = False

    @field_validator("kinds")
    @classmethod
    def _kinds(cls, value: frozenset[str]) -> frozenset[str]:
        bad = value - KIND_CLASSES
        if bad:
            raise ValueError(f"unknown kinds {sorted(bad)}; use {sorted(KIND_CLASSES)}")
        return value

    @field_validator("sensitivity")
    @classmethod
    def _sensitivity(cls, value: frozenset[str]) -> frozenset[str]:
        bad = value - SENSITIVITIES
        if bad:
            raise ValueError(f"unknown sensitivity {sorted(bad)}; use {sorted(SENSITIVITIES)}")
        return value

    def allows_class(self, cls: str) -> bool:
        """cls: 'conversation', 'knowledge' or 'action:<subkind>'."""
        return "*" in self.kinds or cls in self.kinds or cls.split(":")[0] in self.kinds

    def allows_sensitivity(self, value: str) -> bool:
        return "*" in self.sensitivity or value in self.sensitivity

    def allows_user(self, user_id: str) -> bool:
        return self.users is None or user_id in self.users


class ScopeBook(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    principals: dict[str, Scope] = Field(default_factory=dict)

    def get(self, name: str) -> Scope | None:
        return self.principals.get(name)


EMPTY_BOOK = ScopeBook()
_cache: dict[str, ScopeBook] = {}


def _config_text() -> str:
    inline = os.environ.get("LEDGER_SCOPES", "").strip()
    if inline:
        return inline
    path = os.environ.get("LEDGER_SCOPES_FILE", "").strip()
    if not path:
        return ""
    try:
        return Path(path).read_text()
    except OSError:
        log.error("scopes file cannot be read; every principal is denied the read API")
        return ""


def load_scope_book() -> ScopeBook:
    text = _config_text()
    if not text:
        return EMPTY_BOOK
    if text in _cache:
        return _cache[text]
    try:
        book = ScopeBook.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as exc:
        log.error("scopes config is invalid (%s); every principal is denied", type(exc).__name__)
        book = EMPTY_BOOK
    _cache.clear()
    _cache[text] = book
    return book


def principal_kind(name: str, book: ScopeBook) -> str:
    scope = book.get(name)
    return "agent" if scope is not None and not scope.internal else "service"


def owner_for(principal: Principal, user_id: str, scope: Scope | None = None) -> str | None:
    """THE owner seam: the user a request may act for, or None (refused).

    Internal service routes (scope None): only a trusted service principal, for any user.
    Read API (scope given): the principal's scope must allow that user.
    """
    if not user_id or not user_id.strip():
        return None
    if scope is None:
        return user_id if principal.kind == "service" else None
    return user_id if scope.allows_user(user_id) else None
