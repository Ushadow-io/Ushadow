"""The scope gate: the ONE place where read-API items are filtered by the caller's scope.

It walks a whole answer (any depth) and removes every ScopedItem the scope does not allow:
its kind class (and any extra classes it `requires`) and its sensitivity. It returns how many
items it removed; their content is gone from the answer.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from ledger.read_models import ScopedItem
from ledger.scopes import Scope


def allows(scope: Scope, item: ScopedItem) -> bool:
    classes = [item.scope_class, *item.requires]
    return all(scope.allows_class(c) for c in classes) and scope.allows_sensitivity(
        item.sensitivity
    )


def _list(scope: Scope, values: list[Any]) -> tuple[list[Any], int]:
    kept, removed = [], 0
    for value in values:
        out, n = _walk(scope, value)
        removed += n
        if out is not None:
            kept.append(out)
    return kept, removed


def _walk(scope: Scope, value: Any) -> tuple[Any, int]:
    if isinstance(value, ScopedItem) and not allows(scope, value):
        return None, 1
    if not isinstance(value, BaseModel):
        return value, 0
    removed = 0
    for name in type(value).model_fields:
        field = getattr(value, name)
        if isinstance(field, list):
            kept, n = _list(scope, field)
            if n:
                setattr(value, name, kept)
            removed += n
        elif isinstance(field, BaseModel):
            out, n = _walk(scope, field)
            if n:
                setattr(value, name, out)
            removed += n
    return value, removed


def apply(scope: Scope, answer: BaseModel) -> int:
    """Filter `answer` in place. Returns the number of items withheld."""
    return _walk(scope, answer)[1]
