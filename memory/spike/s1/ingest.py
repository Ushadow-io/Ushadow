"""Feed episodes to Graphiti one by one (sequential, as Graphiti requires) and
measure each one. Logs and metrics hold ids and counts, never transcript text."""

from __future__ import annotations

import time
import traceback
from pathlib import Path
from typing import Any

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

from . import graph
from .episodes import Episode
from .instrument import CallLedger, current_episode


async def ingest(
    g: Graphiti, eps: list[Episode], group: str, ledger: CallLedger,
    errors_log: Path, label_prefix: str = "",
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Returns per-episode metrics and {our episode id: graphiti episode uuid}."""
    rows: list[dict[str, Any]] = []
    id_map: dict[str, str] = {}
    for n, ep in enumerate(eps, start=1):
        label = f"{label_prefix}{ep.episode_id}"
        before_e = {e["uuid"] for e in await graph.edges(g, group)}
        before_n = {e["uuid"] for e in await graph.entities(g, group)}
        row: dict[str, Any] = {**ep.stats(), "day": ep.day, "group_id": group, "error": None}
        token = current_episode.set(label)
        t0 = time.perf_counter()
        try:
            res = await g.add_episode(
                name=ep.episode_id,
                episode_body=ep.body(),
                source_description=(f"ushadow s1 {ep.origin} {ep.conversation_id or ''} "
                                    f"recordings={','.join(ep.recording_ids)}").strip(),
                reference_time=ep.reference_time,
                source=EpisodeType.message,
                group_id=group,
            )
            row["wall_s"] = round(time.perf_counter() - t0, 3)
            id_map[ep.episode_id] = res.episode.uuid
            row["graphiti_episode_uuid"] = res.episode.uuid
            row["nodes_returned"] = len(res.nodes)
            row["nodes_new"] = sum(1 for x in res.nodes if x.uuid not in before_n)
            row["edges_returned"] = len(res.edges)
            row["edges_new"] = sum(1 for x in res.edges if x.uuid not in before_e)
            row["edges_closed_existing"] = sum(
                1 for x in res.edges if x.uuid in before_e and (x.invalid_at or x.expired_at))
            row["edges_new_with_valid_at"] = sum(
                1 for x in res.edges if x.uuid not in before_e and x.valid_at)
        except Exception as exc:  # keep going; record type only (message may hold text)
            row["wall_s"] = round(time.perf_counter() - t0, 3)
            row["error"] = type(exc).__name__
            with errors_log.open("a", encoding="utf-8") as fh:
                fh.write(f"=== {label}\n{traceback.format_exc()}\n")
        finally:
            current_episode.reset(token)
        row.update(ledger.for_episode(label))
        rows.append(row)
        print(f"  [{n}/{len(eps)}] {ep.episode_id}: {row['lines']} lines, "
              f"{row['llm_http_calls']} LLM calls, {row['input_tokens']}+{row['output_tokens']} tok, "
              f"{row['wall_s']}s, +{row.get('edges_new', 0)} facts, "
              f"+{row.get('nodes_new', 0)} entities" + (f", ERROR {row['error']}" if row["error"] else ""),
              flush=True)
    return rows, id_map
