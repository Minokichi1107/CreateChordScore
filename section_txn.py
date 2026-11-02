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
    # A leftover .part is evidence of an earlier failure: never delete it. The exclusive
    # create below fails (FileExistsError) when it exists, so the write stops safely.
    payload = json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8")
    write_synced(part, payload)
    os.replace(part, final)  # on failure the .part stays on disk for manual recovery


def inspect_journal(paths: TxnPaths, txn_id: str) -> tuple[str, dict[str, Any] | None]:
    """Classify a journal: "missing" | "ok" | "corrupt" | "invalid" | "unreadable".

    Only "missing" means there is no record. Anything else must stop a new save.
    """
    try:
        raw = read_bytes(paths.journal(txn_id))
    except FileNotFoundError:
        return "missing", None
    except OSError:
        return "unreadable", None
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "corrupt", None
    if not isinstance(value, dict) or value.get("state") not in JOURNAL_STATES:
        return "invalid", None
    return "ok", value


def read_journal(paths: TxnPaths, txn_id: str) -> dict[str, Any] | None:
    """Compatibility wrapper: the record when it is "ok", otherwise None."""
    status, value = inspect_journal(paths, txn_id)
    return value if status == "ok" else None


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
    if os.path.exists(final):
        # Same second and same h0 name: reuse it only if it is verified; never delete it.
        try:
            if sha256_hex(read_bytes(final)) == h0:
                return final
        except OSError:
            pass
        raise TxnError("backup-failed", "backup name already exists and is not verified")
    created_part = created_final = False
    try:
        try:
            write_synced(part, data)  # exclusive create: fails if a .bak.part exists
        except FileExistsError as exc:
            raise TxnError("backup-failed", "bak-part-present") from exc  # keep it, delete nothing
        created_part = True
        os.replace(part, final)
        created_part, created_final = False, True
        if sha256_hex(read_bytes(final)) != h0:
            raise TxnError("backup-failed", "read-back hash mismatch")
    except TxnError:
        _discard_own_backup(part, final, created_part, created_final)
        raise
    except OSError as exc:
        _discard_own_backup(part, final, created_part, created_final)
        raise TxnError("backup-failed", str(exc)) from exc
    return final


def _discard_own_backup(part: str, final: str, created_part: bool, created_final: bool) -> None:
    """Delete only the unverified files that THIS attempt created (never an existing one)."""
    if created_part:
        remove_quietly(part)
    if created_final:
        remove_quietly(final)


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

VERIFY_RETRIES = 3           # S10: read the replaced file up to 3 times (provisional, unmeasured)
VERIFY_WAIT_SECONDS = 0.1    # provisional, unmeasured


def assert_same_volume(paths: TxnPaths) -> None:
    """Fail closed: os.replace is only atomic on one volume. Unknown counts as not safe."""
    try:
        tmp_dev = os.stat(paths.tmp_dir).st_dev
        dst_dev = os.stat(paths.analysis_dir).st_dev
    except OSError as exc:
        raise TxnError("volume-check-failed", str(exc)) from exc
    if tmp_dev == 0 or dst_dev == 0:
        raise TxnError("volume-check-failed", "st_dev is not available")
    if tmp_dev != dst_dev:
        raise TxnError("cross-volume", "_txn/tmp and the analysis folder are on different volumes")


def guard_leftovers(paths: TxnPaths, project_id: str, txn_id: str) -> None:
    """Stop a new save when an earlier failure left evidence behind. Nothing is changed.

    Stops (spec DJ-JR-4 scope): an unreadable/invalid journal or any .journal.part -> every
    project; an unsettled (prepared/indeterminate) journal or a .bak.part -> that project;
    a tmp with no journal -> that txnId.
    """
    try:
        names = sorted(os.listdir(paths.journal_dir))
    except OSError as exc:
        raise TxnError("journal-corrupt", f"unreadable: {exc}") from exc
    for name in names:
        if name.endswith(".journal.part"):
            raise TxnError("journal-corrupt", "part-present")
    for name in names:
        if not name.endswith(".journal"):
            continue
        status, record = inspect_journal(paths, name[: -len(".journal")])
        if status != "ok":
            raise TxnError("journal-corrupt", status)
        if record.get("projectId") == project_id and record["state"] in ("prepared", "indeterminate"):
            raise TxnError("indeterminate", f"an earlier save is {record['state']}: settle it before saving again")
    status, _ = inspect_journal(paths, txn_id)
    if status == "missing" and os.path.exists(paths.tmp(txn_id)):
        raise TxnError("tmp-exists", "a tmp file with this txnId exists without a journal")
    try:
        if any(n.endswith(".bak.part") for n in os.listdir(paths.backup_dir(project_id))):
            raise TxnError("backup-failed", "bak-part-present")
    except FileNotFoundError:
        pass


def _reject_non_finite(value: Any, where: str) -> None:
    """NaN/Infinity would be written as invalid JSON; refuse them before anything is written."""
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, float) and (item != item or item in (float("inf"), float("-inf"))):
            raise TxnError("not-eligible", f"non-finite-number in {where}")
        if isinstance(item, dict):
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)


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
    assert_same_volume(paths)
    guard_leftovers(paths, project_id, txn_id)  # stops on any leftover; changes nothing
    if inspect_journal(paths, txn_id)[0] != "missing":
        raise TxnError("txn-exists", "use the status query for an existing txnId")
    _reject_non_finite(sections, "sections")

    # S1/S2 ----------------------------------------------------------- read
    _hook(hooks, "S1")
    path, source = _read_current(resolve_fn, project_id)
    h0 = sha256_hex(source)
    if h0 != expected_sha256:
        raise TxnError("conflict", "file changed since it was read")
    try:
        original = parse_analysis_bytes(source)
        _reject_non_finite(original, "analysis file")
        # S3: candidate in memory only; generatedAt is stamped afterwards (spec §7.4 exception)
        candidate = build_section_candidate(original, project_id, sections, provenance_patch)
        stamp = generated_at or _now_iso()
        candidate["generatedAt"] = stamp
        validate_analysis_candidate(original, candidate, project_id, allow_generated_at_update=True)
        data1 = serialize_analysis_like_source(source, candidate)
        data1.decode("utf-8")  # lone surrogates etc. must fail here, not at write time
    except SectionSaveValidationError as exc:
        reason = "not-eligible" if str(exc).startswith("not-eligible") else "validation-failed"
        raise TxnError(reason, str(exc)) from exc
    except UnicodeError as exc:
        raise TxnError("not-eligible", f"invalid-encoding: {exc}") from exc
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
        except FileExistsError as exc:  # not ours: keep it untouched and stop
            raise TxnError("tmp-exists", str(exc)) from exc
        except OSError as exc:
            # The write itself broke, so this attempt's tmp is incomplete: the only case
            # where deleting a tmp is allowed.
            remove_quietly(tmp)
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
        raise  # the authoritative file is untouched; tmp and backup are kept as evidence

    # S8 ----------------------------------------------- re-check the original
    try:
        _hook(hooks, "S8")
        path2, again = _read_current(resolve_fn, project_id)
        if path2 != path or sha256_hex(again) != h0:
            raise TxnError("conflict", "file changed before replace")
    except TxnError as exc:
        _finish_journal(paths, txn_id, record, "aborted")  # tmp is kept
        raise TxnError(exc.reason, exc.detail, "aborted")

    # S9 ----------------------------------------------------------- replace
    try:
        _hook(hooks, "S9")
        replace_with_retry(tmp, path, replace_fn, sleep_fn)
    except Exception as exc:  # never assume the old state (spec §7.5)
        print(f"[analysis] replace raised {type(exc).__name__}: {exc}")
        _settle_after_replace_error(paths, txn_id, record, resolve_fn, project_id, tmp, h0, h1, exc)

    # S10 ------------------------------------------------- post-replace check
    # Read up to VERIFY_RETRIES times; one clean read (hash == h1 and valid) is enough.
    last_error: TxnError | None = None
    for attempt in range(VERIFY_RETRIES):
        try:
            _hook(hooks, "S10")
            _verify_file(path, h1, original, project_id, "post-verify-failed")
            last_error = None
            break
        except TxnError as exc:
            last_error = exc
            if attempt < VERIFY_RETRIES - 1:
                sleep_fn(VERIFY_WAIT_SECONDS)
    if last_error is not None:
        _finish_journal(paths, txn_id, record, "indeterminate")
        raise TxnError(last_error.reason, last_error.detail, "indeterminate")

    # S11 ------------------------------------------------------- committed
    try:
        _hook(hooks, "S11")
        _finish_journal(paths, txn_id, record, "committed", raise_on_error=True)
    except Exception as exc:  # file is already new; status query can derive committed
        print(f"[analysis] journal commit update failed (file is committed): {exc}")

    # S13 -------------------------------------------------------- cleanup
    # tmp was consumed by the replace; a tmp that is somehow still here is left alone.
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
        _finish_journal(paths, txn_id, record, "aborted")  # tmp is kept
        raise TxnError("replace-failed", str(exc), "aborted")
    _finish_journal(paths, txn_id, record, "indeterminate")  # tmp/backup/journal all kept
    raise TxnError("indeterminate", f"replace error and unexpected file state: {exc}", "indeterminate")


# ------------------------------------------------ recovery and status query

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
    if hc is not None and hc == record.get("h1"):
        _finish_journal(paths, txn_id, record, "committed")
        return "committed"
    if hc is not None and hc == record.get("h0"):
        _finish_journal(paths, txn_id, record, "aborted")  # tmp is kept
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
    # Orphan tmp files are never deleted automatically (they may hold unsaved edits).
    # `now_ts` is kept only so existing callers keep working.
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
