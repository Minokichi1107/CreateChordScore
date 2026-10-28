"""W9 G1/G3/G4 (and G2 when --workdir is a sync folder) check, run on real Windows.

Usage (PowerShell, repo root):
    python scripts\\w9_windows_check.py --workdir C:\\work\\w9_local --label local
    python scripts\\w9_windows_check.py --workdir "C:\\Users\\<you>\\Dropbox\\w9_sync" --label sync

It only touches a fresh sub-folder of --workdir with generated sample data
(or a COPY you pass via --source). It never reads or writes the live analysis/ folder.
It uses the real section_txn.py code path (same os.replace, same _txn layout).
Output: a JSON report (also saved as w9_report_<label>.json in --workdir).
"""
import argparse
import json
import os
import platform
import shutil
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import section_txn as tx  # noqa: E402
from section_save import sha256_hex  # noqa: E402

PID = str(uuid.uuid4())


def sample_bytes():
    doc = {"version": 1, "projectId": PID, "generatedAt": "2026-10-27T00:00:00.000Z",
           "raw": {"chords": [{"_id": "c1"}, {"_id": "c2"}, {"_id": "c3"}], "bpm": 120,
                   "meta": {"title": "日本語テスト"}, "sections": [],
                   "provenance": {"hasContentEdit": True, "hasStructureEdit": False}},
           "repairRule": None}
    return b"\xef\xbb\xbf" + json.dumps(doc, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode("utf-8")


def resolver(folder):
    def resolve(project_id):
        hits = [os.path.join(folder, n) for n in os.listdir(folder) if n.endswith(f"_{project_id}.json")]
        return ("none", None) if not hits else ("ok", hits[0]) if len(hits) == 1 else ("multiple", hits)
    return resolve


def sections_for(path):
    ids = [c["_id"] for c in json.loads(open(path, "rb").read().decode("utf-8-sig"))["raw"]["chords"]]
    return [{"id": "s1", "type": "verse", "name": "A", "startChordId": ids[0], "endChordId": ids[-1]}]


def fresh_case(base, name, source):
    folder = os.path.join(base, f"{name}_{int(time.time())}")
    os.makedirs(folder)
    path = os.path.join(folder, f"Artist_Title_{PID}.json")
    with open(path, "wb") as f:
        f.write(open(source, "rb").read() if source else sample_bytes())
    return folder, path


def save(folder, path, txn, source_hash, **kw):
    return tx.commit_section_save(folder, PID, txn, source_hash, sections_for(path), {},
                                  resolve_fn=resolver(folder), **kw)


def g3(base):
    folder, path = fresh_case(base, "g3", None)
    paths = tx.TxnPaths(folder)
    paths.ensure()
    return {"id": "G3", "same_volume": tx.check_same_volume(folder),
            "st_dev_analysis": os.stat(folder).st_dev, "st_dev_tmp": os.stat(paths.tmp_dir).st_dev,
            "drive_analysis": os.path.splitdrive(os.path.abspath(folder))[0],
            "drive_tmp": os.path.splitdrive(os.path.abspath(paths.tmp_dir))[0]}


def g1(base, source, pause=False):
    folder, path = fresh_case(base, "g1", source)
    before = open(path, "rb").read()
    h0 = sha256_hex(before)
    out = {"id": "G1", "h0": h0}
    holder = None
    if pause:  # real-app mode: you open the file in an app, then press Enter
        print(f"\n[G1 real-app mode] Open this file in your app NOW (do not edit/save):\n  {path}")
        input("Opened? Press Enter to attempt the save... ")
        out["mode"] = "real-app"
    else:
        holder = open(path, "rb")  # another reader that did not allow delete/rename
    try:
        t0 = time.time()
        try:
            save(folder, path, "g1-blocked-0001", h0)
            out["blocked_result"] = "UNEXPECTED_SUCCESS"
        except tx.TxnError as exc:
            out["blocked_result"] = f"{exc.reason} (state={exc.state})"
            out["blocked_error_text"] = str(exc)
        out["blocked_seconds"] = round(time.time() - t0, 3)
        out["file_unchanged_while_held"] = open(path, "rb").read() == before
        out["tmp_left"] = os.listdir(tx.TxnPaths(folder).tmp_dir)
    finally:
        if holder:
            holder.close()
    if pause:
        input("Now CLOSE the app, then press Enter to retry the save... ")
    if out["blocked_result"] == "UNEXPECTED_SUCCESS":
        out["note"] = "replace was NOT blocked while the file was held open (expected on Linux; on Windows record this as-is)"
        return out
    result = save(folder, path, "g1-after-0002", h0)
    out["after_release_new_sha256"] = result["newSha256"]
    out["after_release_matches_disk"] = sha256_hex(open(path, "rb").read()) == result["newSha256"]
    return out


def g4(base, source):
    folder, path = fresh_case(base, "g4", source)
    before = open(path, "rb").read()
    result = save(folder, path, "g4-bytes-0003", sha256_hex(before))
    after = open(path, "rb").read()
    old = json.loads(before.decode("utf-8-sig"))
    new = json.loads(after.decode("utf-8-sig"))
    changed = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
    raw_changed = sorted(k for k in set(old["raw"]) | set(new["raw"]) if old["raw"].get(k) != new["raw"].get(k))
    bak = os.path.join(tx.TxnPaths(folder).backup_dir(PID), os.listdir(tx.TxnPaths(folder).backup_dir(PID))[0])
    return {"id": "G4", "before_sha256": sha256_hex(before), "after_sha256": result["newSha256"],
            "bom_kept": before.startswith(b"\xef\xbb\xbf") == after.startswith(b"\xef\xbb\xbf"),
            "crlf_before": before.count(b"\r\n"), "lf_only_before": before.count(b"\n") - before.count(b"\r\n"),
            "crlf_after": after.count(b"\r\n"), "lf_only_after": after.count(b"\n") - after.count(b"\r\n"),
            "trailing_newline_before": before.endswith((b"\n", b"\r")),
            "trailing_newline_after": after.endswith((b"\n", b"\r")),
            "top_level_keys_changed": changed, "raw_keys_changed": raw_changed,
            "backup_equals_original_bytes": open(bak, "rb").read() == before}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", required=True)
    ap.add_argument("--label", default="local")
    ap.add_argument("--only", choices=["g1", "g3", "g4"], help="run just one case")
    ap.add_argument("--pause-g1", action="store_true", help="G1 with a real app (interactive)")
    ap.add_argument("--source", help="a COPY of an analysis json whose raw.sections is empty (optional)")
    args = ap.parse_args()
    os.makedirs(args.workdir, exist_ok=True)
    report = {"label": args.label, "workdir": os.path.abspath(args.workdir), "python": sys.version,
              "os": platform.platform(), "os_version": platform.version(), "cases": []}
    for fn in (g3, g1, g4):
        if args.only and fn.__name__ != args.only:
            continue
        try:
            if fn is g3:
                report["cases"].append(fn(args.workdir))
            elif fn is g1:
                report["cases"].append(fn(args.workdir, args.source, args.pause_g1))
            else:
                report["cases"].append(fn(args.workdir, args.source))
        except Exception as exc:  # report, never hide
            report["cases"].append({"id": fn.__name__, "error": f"{type(exc).__name__}: {exc}"})
    text = json.dumps(report, ensure_ascii=False, indent=2)
    with open(os.path.join(args.workdir, f"w9_report_{args.label}.json"), "w", encoding="utf-8") as f:
        f.write(text)
    print(text)


if __name__ == "__main__":
    main()
