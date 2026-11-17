"""eval/run_staged.py in --stub mode on the synthetic fixture: counts out, no text on the console."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parents[1]
FIXTURES = SERVICE.parent / "spike" / "fixtures" / "synthetic"
DAY = "2026-01-05"


def _script():
    spec = importlib.util.spec_from_file_location("run_staged", SERVICE / "eval" / "run_staged.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.skipif(not (FIXTURES / f"{DAY}.bundle.json").exists(), reason="synthetic fixture missing")
async def test_stub_run_writes_counts_and_prints_no_text(tmp_path, capsys):
    mod = _script()
    out = tmp_path / "out"
    for mode in ("collection", "per_fact"):
        m = await mod.main(["--bundle-dir", str(FIXTURES), "--day", DAY, "--group", "staged-test-eval",
                            "--reconcile", mode, "--out", str(out / mode), "--stub",
                            "--maintain-budget", "3"])
        assert m["episodes"] >= 1 and m["failures"] == {}
        assert m["stages"]["extract"]["calls"] >= m["episodes"]
        bands = m["graph"]["confidence_bands"]["entity_matches"]
        assert set(bands) == {"<0.4", "0.4-0.6", "0.6-0.8", ">=0.8"}
        assert m["graph"]["facts"] > 0 and m["graph"]["entities_uncertain"] >= 0
        assert m["maintenance"]["batches"] >= 1
        assert json.loads((out / mode / "metrics.json").read_text())["day"] == DAY
        assert (out / mode / "report.md").exists() and (out / mode / "facts.jsonl").exists()
    printed = capsys.readouterr().out
    bundle = json.loads((FIXTURES / f"{DAY}.bundle.json").read_text())
    for t in bundle["transcripts"]:
        for seg in t["segments"]:
            assert not seg["text"].strip() or seg["text"] not in printed
            for word in seg["text"].split():
                if word[:1].isupper() and len(word) > 3:
                    assert word.strip(".,!?") not in printed  # no names either
    for line in (out / "collection" / "report.md").read_text().splitlines():
        assert not any(seg["text"].strip() and seg["text"] in line
                       for t in bundle["transcripts"] for seg in t["segments"])


def test_out_dir_in_the_repo_must_be_ignored(tmp_path):
    mod = _script()
    with pytest.raises(SystemExit):
        mod.check_out_dir(SERVICE / "src" / "not-ignored-probe")
    (SERVICE / "src" / "not-ignored-probe").rmdir()
    mod.check_out_dir(tmp_path / "outside")  # outside any repo: fine
