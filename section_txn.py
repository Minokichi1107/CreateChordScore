"""W2: Section-save transaction layer (file operations only, no HTTP).

Spec: docs/section-save-technical-design.md  §7 (transaction), §9 (backup/journal/recovery).
Pure helpers (hash / serialize / validate) come from section_save.py (W1).

Layout under ANALYSIS_DIR (the directory that holds the authoritative analysis JSON):
    _txn/tmp/<txnId>.tmp
    _txn/journal/<txnId>.journal
    _txn/backup/<projectId>/<UTC>_<sha32>.bak
None of these use the .json extension, and `_txn` does not end with `_<id>.json`,
so resolve_analysis_file() never picks them up.
"""
from __future__ import annotations
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Callable

from section_save import sha256_hex

TXN_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")
PROJECT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
JOURNAL_STATES = ("prepared", "committed", "aborted", "indeterminate")
REPLACE_RETRIES = 3          # spec T-9 (initial value; tuned by W9 G1 / U-5)
REPLACE_WAIT_SECONDS = 0.1


class TxnError(Exception):
    """A save-transaction failure. `reason` is the API reason code (spec §7.3)."""

    def __init__(self, reason: str, detail: str = "", state: str | None = None):
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason
        self.detail = detail
        self.state = state  # journal state left behind, if any


class TxnPaths:
    """Resolve the _txn directory layout and create it on demand."""

    def __init__(self, analysis_dir: str):
        self.analysis_dir = analysis_dir
        self.root = os.path.join(analysis_dir, "_txn")
        self.tmp_dir = os.path.join(self.root, "tmp")
        self.journal_dir = os.path.join(self.root, "journal")
        self.backup_root = os.path.join(self.root, "backup")

    def ensure(self) -> None:
        for path in (self.tmp_dir, self.journal_dir, self.backup_root):
            os.makedirs(path, exist_ok=True)

    def tmp(self, txn_id: str) -> str:
        return os.path.join(self.tmp_dir, f"{txn_id}.tmp")

    def journal(self, txn_id: str) -> str:
        return os.path.join(self.journal_dir, f"{txn_id}.journal")

    def backup_dir(self, project_id: str) -> str:
        return os.path.join(self.backup_root, project_id)


def check_same_volume(analysis_dir: str) -> bool:
    """Self-diagnosis for spec §7.1: _txn/tmp and the analysis dir share a volume.

    Uses st_dev. Whether st_dev is trustworthy on Windows is verified by W9 G3.
    """
    paths = TxnPaths(analysis_dir)
    paths.ensure()
    return os.stat(paths.tmp_dir).st_dev == os.stat(analysis_dir).st_dev


# ---------------------------------------------------------------- low-level IO

def read_bytes(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def write_synced(path: str, data: bytes, *, exclusive: bool = True) -> None:
    """Write bytes in binary mode, then flush + fsync (no newline translation)."""
    mode = "xb" if exclusive else "wb"
    with open(path, mode) as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def remove_quietly(path: str | None) -> None:
    """Best-effort delete; cleanup failures never change a save result (§7.3 S13)."""
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as exc:
        print(f"[analysis] cleanup failed: {path}: {exc}")


# --------------------------------------------------------------------- journal

def write_journal(paths: TxnPaths, txn_id: str, record: dict[str, Any]) -> None:
    """Write the journal atomically (.part -> fsync -> os.replace in the same dir)."""
    if record.get("state") not in JOURNAL_STATES:
        raise ValueError(f"bad journal state: {record.get('state')!r}")
    final = paths.journal(txn_id)
    part = final + ".part"
    remove_quietly(part)
    payload = json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8")
    write_synced(part, payload)
    os.replace(part, final)


def read_journal(paths: TxnPaths, txn_id: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_bytes(paths.journal(txn_id)).decode("utf-8"))
    except (FileNotFoundError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or value.get("state") not in JOURNAL_STATES:
        return None
    return value


# ---------------------------------------------------------------------- backup

def utc_stamp(now: Callable[[], datetime] | None = None) -> str:
    moment = now() if now else datetime.now(timezone.utc)
    return moment.strftime("%Y%m%dT%H%M%SZ")


def create_backup(paths: TxnPaths, project_id: str, h0: str, data: bytes,
                  now: Callable[[], datetime] | None = None) -> str:
    """Spec §9.1: write h0's exact bytes to .bak.part, fsync, rename, read back, verify.

    Returns the final .bak path. An unverified backup is deleted and TxnError raised.
    """
    directory = paths.backup_dir(project_id)
    os.makedirs(directory, exist_ok=True)
    final = os.path.join(directory, f"{utc_stamp(now)}_{h0[:32]}.bak")
    part = final + ".part"
    try:
        remove_quietly(part)
        write_synced(part, data)
        os.replace(part, final)
        if sha256_hex(read_bytes(final)) != h0:
            raise TxnError("backup-failed", "read-back hash mismatch")
    except TxnError:
        remove_quietly(part)
        remove_quietly(final)
        raise
    except OSError as exc:
        remove_quietly(part)
        remove_quietly(final)
        raise TxnError("backup-failed", str(exc)) from exc
    return final


# ------------------------------------------------------------ journal queries

def iter_journals(paths: TxnPaths):
    """Yield (txn_id, record) for every readable journal."""
    try:
        names = sorted(os.listdir(paths.journal_dir))
    except FileNotFoundError:
        return
    for name in names:
        if not name.endswith(".journal"):
            continue
        txn_id = name[: -len(".journal")]
        record = read_journal(paths, txn_id)
        if record is not None:
            yield txn_id, record


def project_has_state(paths: TxnPaths, project_id: str, states: tuple[str, ...]) -> bool:
    return any(r.get("projectId") == project_id and r.get("state") in states
               for _, r in iter_journals(paths))


def prune_backups(paths: TxnPaths, project_id: str, keep: int = 2) -> None:
    """Spec §9.1.1: keep the newest `keep`; never prune while prepared/indeterminate exists."""
    if project_has_state(paths, project_id, ("prepared", "indeterminate")):
        return
    directory = paths.backup_dir(project_id)
    try:
        names = sorted((n for n in os.listdir(directory) if n.endswith(".bak")), reverse=True)
    except FileNotFoundError:
        return
    for name in names[keep:]:
        remove_quietly(os.path.join(directory, name))


# ------------------------------------------------------------- the transaction

def _hook(hooks: dict[str, Callable[[], None]] | None, stage: str) -> None:
    if hooks and stage in hooks:
        hooks[stage]()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _read_current(resolve_fn, project_id: str) -> tuple[str, bytes]:
    status, found = resolve_fn(project_id)
    if status == "none":
        raise TxnError("not-found")
    if status == "multiple":
        raise TxnError("duplicate")
    try:
        return found, read_bytes(found)
    except OSError as exc:
        raise TxnError("read-error", str(exc)) from exc


def replace_with_retry(src: str, dst: str, replace_fn=os.replace, sleep_fn=time.sleep) -> None:
    """The single os.replace call site (spec S9). Retries PermissionError only."""
    for attempt in range(REPLACE_RETRIES + 1):
        try:
            replace_fn(src, dst)
            return
        except PermissionError:
            if attempt == REPLACE_RETRIES:
                raise
            sleep_fn(REPLACE_WAIT_SECONDS)


def _verify_file(path: str, expected_sha: str, original: dict, project_id: str, fail_reason: str) -> bytes:
    """Read back `path`; hash must equal expected_sha and the candidate rules must hold."""
    from section_save import (SectionSaveValidationError, parse_analysis_bytes,
                              validate_analysis_candidate)
    try:
        data = read_bytes(path)
        if sha256_hex(data) != expected_sha:
            raise TxnError(fail_reason, "hash mismatch")
        validate_analysis_candidate(original, parse_analysis_bytes(data), project_id,
                                    allow_generated_at_update=True)
    except TxnError:
        raise
    except (OSError, SectionSaveValidationError) as exc:
        raise TxnError(fail_reason, str(exc)) from exc
    return data


def commit_section_save(
    analysis_dir: str,
    project_id: str,
    txn_id: str,
    expected_sha256: str,
    sections: Any,
    provenance_patch: Any,
    *,
    resolve_fn: Callable[[str], tuple],
    generated_at: str | None = None,
    now: Callable[[], datetime] | None = None,
    hooks: dict[str, Callable[[], None]] | None = None,
    replace_fn: Callable[[str, str], None] = os.replace,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Run spec §7.3 S0-S13. Returns the success payload or raises TxnError.

    `hooks[stage]` (e.g. "S5") runs at the start of a stage; tests raise from it
    to inject failures. `replace_fn` lets tests simulate os.replace failures.
    """
    from section_save import (SectionSaveValidationError, build_section_candidate,
                              parse_analysis_bytes, serialize_analysis_like_source,
                              validate_analysis_candidate)

    # S0 -------------------------------------------------------------- format
    if not (isinstance(txn_id, str) and TXN_ID_PATTERN.match(txn_id)
            and isinstance(project_id, str) and PROJECT_ID_PATTERN.match(project_id)
            and isinstance(expected_sha256, str) and SHA256_PATTERN.match(expected_sha256)):
        raise TxnError("bad-request")
    paths = TxnPaths(analysis_dir)
    paths.ensure()
    if project_has_state(paths, project_id, ("indeterminate",)):
        raise TxnError("indeterminate", "an earlier save left this song in an indeterminate state")
    if read_journal(paths, txn_id) is not None:
        raise TxnError("txn-exists", "use the status query for an existing txnId")

    # S1/S2 ----------------------------------------------------------- read
    _hook(hooks, "S1")
    path, source = _read_current(resolve_fn, project_id)
    h0 = sha256_hex(source)
    if h0 != expected_sha256:
        raise TxnError("conflict", "file changed since it was read")
    try:
        original = parse_analysis_bytes(source)
        # S3: candidate in memory only; generatedAt is stamped afterwards (spec §7.4 exception)
        candidate = build_section_candidate(original, project_id, sections, provenance_patch)
        stamp = generated_at or _now_iso()
        candidate["generatedAt"] = stamp
        validate_analysis_candidate(original, candidate, project_id, allow_generated_at_update=True)
        data1 = serialize_analysis_like_source(source, candidate)
    except SectionSaveValidationError as exc:
        reason = "not-eligible" if str(exc).startswith("not-eligible") else "validation-failed"
        raise TxnError(reason, str(exc)) from exc
    h1 = sha256_hex(data1)

    tmp = paths.tmp(txn_id)
    backup = None
    record = {"txnId": txn_id, "projectId": project_id, "path": path, "h0": h0, "h1": h1,
              "tmp": os.path.basename(tmp), "backup": None, "state": "prepared",
              "startedAt": _now_iso(), "updatedAt": None}
    try:
        # S4 ------------------------------------------------------- tmp write
        try:
            _hook(hooks, "S4")
            write_synced(tmp, data1)
        except OSError as exc:
            raise TxnError("write-failed", str(exc)) from exc
        # S5 ------------------------------------------------------ read back
        _hook(hooks, "S5")
        _verify_file(tmp, h1, original, project_id, "verify-failed")
        # S6 -------------------------------------------------------- backup
        _hook(hooks, "S6")
        backup = create_backup(paths, project_id, h0, source, now)
        record["backup"] = os.path.relpath(backup, paths.root)
        # S7 -------------------------------------------------------- journal
        try:
            _hook(hooks, "S7")
            write_journal(paths, txn_id, record)
        except OSError as exc:
            raise TxnError("journal-failed", str(exc)) from exc
    except TxnError:
        remove_quietly(tmp)  # nothing has touched the authoritative file yet
        raise

    # S8 ----------------------------------------------- re-check the original
    try:
        _hook(hooks, "S8")
        path2, again = _read_current(resolve_fn, project_id)
        if path2 != path or sha256_hex(again) != h0:
            raise TxnError("conflict", "file changed before replace")
    except TxnError as exc:
        _finish_journal(paths, txn_id, record, "aborted")
        remove_quietly(tmp)
        raise TxnError(exc.reason, exc.detail, "aborted")

    # S9 ----------------------------------------------------------- replace
    try:
        _hook(hooks, "S9")
        replace_with_retry(tmp, path, replace_fn, sleep_fn)
    except Exception as exc:  # never assume the old state (spec §7.5)
        print(f"[analysis] replace raised {type(exc).__name__}: {exc}")
        _settle_after_replace_error(paths, txn_id, record, resolve_fn, project_id, tmp, h0, h1, exc)

    # S10 ------------------------------------------------- post-replace check
    try:
        _hook(hooks, "S10")
        _verify_file(path, h1, original, project_id, "post-verify-failed")
    except TxnError as exc:
        _finish_journal(paths, txn_id, record, "indeterminate")
        raise TxnError(exc.reason, exc.detail, "indeterminate")

    # S11 ------------------------------------------------------- committed
    try:
        _hook(hooks, "S11")
        _finish_journal(paths, txn_id, record, "committed", raise_on_error=True)
    except Exception as exc:  # file is already new; status query can derive committed
        print(f"[analysis] journal commit update failed (file is committed): {exc}")

    # S13 -------------------------------------------------------- cleanup
    remove_quietly(tmp)
    prune_backups(paths, project_id)
    return {"ok": True, "txnId": txn_id, "projectId": project_id, "path": path,
            "newSha256": h1, "generatedAt": stamp, "sections": candidate["raw"]["sections"]}


def _finish_journal(paths: TxnPaths, txn_id: str, record: dict, state: str,
                    raise_on_error: bool = False) -> None:
    record = dict(record, state=state, updatedAt=_now_iso())
    try:
        write_journal(paths, txn_id, record)
    except Exception as exc:
        if raise_on_error:
            raise
        print(f"[analysis] journal update to {state} failed: {exc}")


def _settle_after_replace_error(paths, txn_id, record, resolve_fn, project_id, tmp, h0, h1, exc) -> None:
    """Spec §7.5: re-read the real file and decide old / new / unknown."""
    try:
        _, current = _read_current(resolve_fn, project_id)
        hc = sha256_hex(current)
    except Exception:
        hc = None
    if hc == h1:
        return  # replace actually happened; caller continues to S10 and commits
    if hc == h0:
        _finish_journal(paths, txn_id, record, "aborted")
        remove_quietly(tmp)
        raise TxnError("replace-failed", str(exc), "aborted")
    _finish_journal(paths, txn_id, record, "indeterminate")  # tmp/backup/journal all kept
    raise TxnError("indeterminate", f"replace error and unexpected file state: {exc}", "indeterminate")


# ------------------------------------------------ recovery and status query

ORPHAN_TMP_MAX_AGE_SECONDS = 600  # spec §9.3 "一定時間経過後" (initial value, Q5)


def _settle_prepared(paths: TxnPaths, txn_id: str, record: dict, resolve_fn) -> str:
    """Decide a `prepared` journal from the real file (never trust the journal alone).

    The only thing automatic recovery may do to the authoritative file's story is
    record `committed`; it never writes the file itself (spec §9.3 principle 1).
    """
    from section_save import SectionSaveValidationError, parse_analysis_bytes
    try:
        _, current = _read_current(resolve_fn, record["projectId"])
        parse_analysis_bytes(current)
        hc = sha256_hex(current)
    except (TxnError, SectionSaveValidationError, KeyError):
        hc = None
    tmp = paths.tmp(txn_id)
    if hc is not None and hc == record.get("h1"):
        _finish_journal(paths, txn_id, record, "committed")
        remove_quietly(tmp)
        return "committed"
    if hc is not None and hc == record.get("h0"):
        _finish_journal(paths, txn_id, record, "aborted")
        remove_quietly(tmp)
        return "aborted"
    _finish_journal(paths, txn_id, record, "indeterminate")  # keep tmp/backup/journal
    return "indeterminate"


def recover(analysis_dir: str, resolve_fn, now_ts: float | None = None) -> list[str]:
    """Startup / pre-save recovery (spec §9.3). Returns human-readable log lines."""
    paths = TxnPaths(analysis_dir)
    paths.ensure()
    log: list[str] = []
    for txn_id, record in iter_journals(paths):
        if record.get("state") == "prepared":
            log.append(f"{txn_id}: prepared -> {_settle_prepared(paths, txn_id, record, resolve_fn)}")
    known = {txn_id for txn_id, _ in iter_journals(paths)}
    current = now_ts if now_ts is not None else time.time()
    for name in sorted(os.listdir(paths.tmp_dir)):
        if not name.endswith(".tmp") or name[:-4] in known:
            continue  # tmp that belongs to a journal is kept/handled above
        full = os.path.join(paths.tmp_dir, name)
        try:
            if current - os.path.getmtime(full) >= ORPHAN_TMP_MAX_AGE_SECONDS:
                remove_quietly(full)
                log.append(f"{name}: orphan tmp removed")
        except OSError:
            pass
    for line in log:
        print(f"[analysis] recovery: {line}")
    return log


def query_txn(analysis_dir: str, txn_id: str, resolve_fn) -> dict[str, Any]:
    """Spec §5.5 core: committed / aborted / indeterminate / unknown (no journal)."""
    if not (isinstance(txn_id, str) and TXN_ID_PATTERN.match(txn_id)):
        raise TxnError("bad-request")
    paths = TxnPaths(analysis_dir)
    record = read_journal(paths, txn_id)
    if record is None:
        return {"state": "unknown"}
    state = record["state"]
    if state == "prepared":
        state = _settle_prepared(paths, txn_id, record, resolve_fn)
    result = {"state": state, "txnId": txn_id, "projectId": record.get("projectId")}
    if state == "committed":
        result["newSha256"] = record.get("h1")
    return result
