"""W2 tests: Section-save transaction (spec §11.2 D / E server-side parts).

All tests run in a temporary directory; no real analysis data is touched.
Windows-only behaviour (G1-G4) is NOT covered here; see W9.
"""
import json
import os
import re
import shutil
import tempfile
import unittest

import section_txn as tx
from section_save import sha256_hex

PID = "123e4567-e89b-12d3-a456-426614174000"
SECTIONS = [{"id": "s1", "type": "verse", "name": "A", "startChordId": "c1", "endChordId": "c2"}]


def fixture():
    return {
        "version": 1, "projectId": PID, "generatedAt": "2026-10-27T00:00:00.000Z",
        "raw": {
            "chords": [{"_id": "c1", "start": 0, "end": 1}, {"_id": "c2", "start": 1, "end": 2}],
            "beats": [0, 1], "bpm": 120, "meta": {"title": "日本語"}, "sections": [],
            "provenance": {"hasContentEdit": True, "hasStructureEdit": False, "externalCheck": {"x": 1}},
        },
        "repairRule": None, "unknown": {"keep": True},
    }


def source_bytes(newline="\r\n", bom=True):
    text = json.dumps(fixture(), ensure_ascii=False, indent=2).replace("\n", newline)
    return (b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8")


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.path = os.path.join(self.dir, f"Artist_Title_{PID}.json")
        self.src = source_bytes()
        with open(self.path, "wb") as f:
            f.write(self.src)
        self.h0 = sha256_hex(self.src)
        self.paths = tx.TxnPaths(self.dir)
        self.n = 0

    def resolve(self, project_id):
        found = [os.path.join(self.dir, n) for n in sorted(os.listdir(self.dir))
                 if n.endswith(f"_{project_id}.json")]
        return ("none", None) if not found else ("ok", found[0]) if len(found) == 1 else ("multiple", found)

    def save(self, **kw):
        self.n += 1
        kw.setdefault("txn_id", f"txn-{self.n:08d}")
        kw.setdefault("expected_sha256", self.h0)
        return tx.commit_section_save(self.dir, PID, kw.pop("txn_id"), kw.pop("expected_sha256"),
                                      SECTIONS, {}, resolve_fn=self.resolve, **kw)

    def disk(self):
        with open(self.path, "rb") as f:
            return f.read()

    def files(self, sub):
        d = os.path.join(self.paths.root, sub)
        return sorted(os.listdir(d)) if os.path.isdir(d) else []

    def assertFails(self, reason, **kw):
        with self.assertRaises(tx.TxnError) as ctx:
            self.save(**kw)
        self.assertEqual(ctx.exception.reason, reason)
        return ctx.exception

    @staticmethod
    def raiser(exc):
        def hook(*_a):
            raise exc
        return hook


class SuccessTests(Base):
    def test_success_preserves_format_and_other_data(self):
        for newline, bom in (("\r\n", True), ("\n", False), ("\r\n", False)):
            with self.subTest(newline=newline, bom=bom):
                self.src = source_bytes(newline, bom)
                with open(self.path, "wb") as f:
                    f.write(self.src)
                self.h0 = sha256_hex(self.src)
                result = self.save(generated_at="2026-10-28T00:00:00.000Z")
                new = self.disk()
                self.assertEqual(sha256_hex(new), result["newSha256"])
                self.assertEqual(new.startswith(b"\xef\xbb\xbf"), bom)
                self.assertFalse(new.endswith((b"\n", b"\r")))
                self.assertEqual(b"\r\n" in new, newline == "\r\n")
                if newline == "\n":
                    self.assertNotIn(b"\r", new)
                doc = json.loads(new.decode("utf-8-sig"))
                self.assertEqual(doc["raw"]["sections"], SECTIONS)
                self.assertEqual(doc["generatedAt"], "2026-10-28T00:00:00.000Z")
                self.assertTrue(doc["raw"]["provenance"]["hasStructureEdit"])
                self.assertEqual(doc["raw"]["provenance"]["externalCheck"], {"x": 1})
                self.assertEqual(doc["unknown"], {"keep": True})
                self.assertEqual(self.files("tmp"), [])
                self.h0 = result["newSha256"]
                # a second save is not eligible (sections now exist) and keeps the file
                self.assertFails("not-eligible")
                self.assertEqual(self.disk(), new)
                os.remove(self.path)

    def test_backup_is_exact_original_and_journal_committed(self):
        self.save(txn_id="txn-00000001")
        (name,) = self.files(f"backup/{PID}")
        self.assertRegex(name, r"^\d{8}T\d{6}Z_[0-9a-f]{32}\.bak$")
        with open(os.path.join(self.paths.backup_dir(PID), name), "rb") as f:
            self.assertEqual(f.read(), self.src)
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "committed")

    def test_txn_files_do_not_confuse_resolver(self):
        self.save()
        self.assertEqual(self.resolve(PID)[0], "ok")
        for root, _dirs, names in os.walk(self.paths.root):
            self.assertFalse([n for n in names if n.endswith(".json")], root)

    def test_server_resolver_ignores_txn_dir(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "server.py"), encoding="utf-8") as f:
            src = f.read()
        body = src[src.index("def resolve_analysis_file"):src.index("def _clean_label_part")]
        ns = {"os": os, "ANALYSIS_DIR": self.dir, "UUID_PATTERN": re.compile(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")}
        exec(body, ns)
        self.save()
        self.assertEqual(ns["resolve_analysis_file"](PID), ("ok", self.path))

    def test_same_volume_check(self):
        self.assertTrue(tx.check_same_volume(self.dir))


class PreWriteFailureTests(Base):
    """D1-D5: nothing touches the authoritative file."""

    def assertUntouched(self):
        self.assertEqual(self.disk(), self.src)
        self.assertEqual(self.files("tmp"), [])

    def test_d1_tmp_write_failure(self):
        self.assertFails("write-failed", hooks={"S4": self.raiser(OSError("disk full"))})
        self.assertUntouched()

    def test_d2_readback_mismatch(self):
        orig = tx.write_synced
        tx.write_synced = lambda p, d, **k: orig(p, d[:-1] + b" ", **k)
        self.addCleanup(setattr, tx, "write_synced", orig)
        self.assertFails("verify-failed")
        self.assertUntouched()

    def test_d3_backup_failure(self):
        orig = tx.create_backup
        tx.create_backup = lambda *a, **k: (_ for _ in ()).throw(tx.TxnError("backup-failed"))
        self.addCleanup(setattr, tx, "create_backup", orig)
        self.assertFails("backup-failed")
        self.assertUntouched()

    def test_d4_journal_failure(self):
        orig = tx.write_journal
        tx.write_journal = lambda *a, **k: (_ for _ in ()).throw(OSError("nope"))
        self.addCleanup(setattr, tx, "write_journal", orig)
        self.assertFails("journal-failed")
        self.assertUntouched()

    def test_d5_external_change_before_replace(self):
        changed = self.src.replace(b"120", b"121")

        def external_write():
            with open(self.path, "wb") as f:
                f.write(changed)
        err = self.assertFails("conflict", hooks={"S8": external_write})
        self.assertEqual(err.state, "aborted")
        self.assertEqual(self.disk(), changed)
        self.assertEqual(self.files("tmp"), [])

    def test_stale_expected_hash_is_conflict_and_creates_nothing(self):
        self.assertFails("conflict", expected_sha256="0" * 64)
        self.assertEqual(self.disk(), self.src)
        self.assertEqual(self.files("journal"), [])

    def test_bad_request_and_ineligible(self):
        self.assertFails("bad-request", txn_id="../x")
        self.assertFails("bad-request", expected_sha256="abc")
        with self.assertRaises(tx.TxnError) as ctx:
            tx.commit_section_save(self.dir, PID, "txn-0000000x", self.h0, [], {}, resolve_fn=self.resolve)
        self.assertEqual(ctx.exception.reason, "validation-failed")
        self.assertEqual(self.disk(), self.src)


class ReplaceFailureTests(Base):
    """D6: the three branches of spec §7.5."""

    def test_d6_replace_fails_before_swap_is_aborted(self):
        sleeps = []

        def deny(src, dst):
            raise PermissionError("in use")
        err = self.assertFails("replace-failed", replace_fn=deny, sleep_fn=sleeps.append)
        self.assertEqual((err.state, len(sleeps)), ("aborted", tx.REPLACE_RETRIES))
        self.assertEqual(self.disk(), self.src)
        self.assertEqual(self.files("tmp"), [])
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "aborted")

    def test_d6_transient_permission_error_then_success(self):
        calls = []

        def flaky(src, dst):
            calls.append(1)
            if len(calls) < 3:
                raise PermissionError("busy")
            os.replace(src, dst)
        result = self.save(replace_fn=flaky, sleep_fn=lambda s: None)
        self.assertEqual(sha256_hex(self.disk()), result["newSha256"])
        self.assertEqual(len(calls), 3)

    def test_d6_replace_succeeds_then_raises_is_committed(self):
        def swap_then_raise(src, dst):
            os.replace(src, dst)
            raise OSError("late error")
        result = self.save(replace_fn=swap_then_raise)
        self.assertEqual(sha256_hex(self.disk()), result["newSha256"])
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "committed")

    def test_d6_replace_error_and_foreign_content_is_indeterminate(self):
        foreign = b'{"someone":"else"}'

        def clobber(src, dst):
            with open(dst, "wb") as f:
                f.write(foreign)
            raise OSError("boom")
        err = self.assertFails("indeterminate", replace_fn=clobber)
        self.assertEqual(err.state, "indeterminate")
        self.assertEqual(self.disk(), foreign)           # nothing is rolled back automatically
        self.assertEqual(len(self.files("tmp")), 1)       # tmp, backup and journal preserved
        self.assertEqual(len(self.files(f"backup/{PID}")), 1)
        # later saves for this song are refused
        self.h0 = sha256_hex(foreign)
        self.assertFails("indeterminate")

    def test_d7_post_verify_failure_is_indeterminate(self):
        def corrupt():
            with open(self.path, "wb") as f:
                f.write(b"not json")
        err = self.assertFails("post-verify-failed", hooks={"S10": corrupt})
        self.assertEqual(err.state, "indeterminate")
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "indeterminate")
        self.assertEqual(len(self.files(f"backup/{PID}")), 1)

    def test_d8_journal_commit_failure_keeps_new_file_and_query_says_committed(self):
        orig = tx.write_journal
        calls = []

        def fail_second(paths, txn_id, record):
            calls.append(record["state"])
            if record["state"] == "committed":
                raise OSError("journal gone")
            return orig(paths, txn_id, record)
        tx.write_journal = fail_second
        self.addCleanup(setattr, tx, "write_journal", orig)
        result = self.save(txn_id="txn-00000001")
        tx.write_journal = orig
        self.assertEqual(sha256_hex(self.disk()), result["newSha256"])
        self.assertEqual(tx.query_txn(self.dir, "txn-00000001", self.resolve)["state"], "committed")


class RecoveryTests(Base):
    """E3: classification after a crash at each stage (simulated by raising SystemExit-like errors)."""

    class Crash(BaseException):
        pass

    def crash_at(self, stage):
        with self.assertRaises(self.Crash):
            self.save(txn_id="txn-00000001", hooks={stage: self.raiser(self.Crash())})

    def test_crash_before_replace_recovers_as_aborted(self):
        self.crash_at("S8")  # journal prepared, tmp + backup exist, file still old
        self.assertEqual(self.disk(), self.src)
        tx.recover(self.dir, self.resolve)
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "aborted")
        self.assertEqual(self.files("tmp"), [])
        self.assertEqual(self.disk(), self.src)

    def test_crash_after_replace_recovers_as_committed(self):
        self.crash_at("S10")  # new file already in place, journal still prepared
        tx.recover(self.dir, self.resolve)
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "committed")
        self.assertEqual(tx.query_txn(self.dir, "txn-00000001", self.resolve)["state"], "committed")

    def test_prepared_with_foreign_file_stops_and_preserves_everything(self):
        self.crash_at("S8")
        with open(self.path, "wb") as f:
            f.write(b'{"x": 1}')
        tx.recover(self.dir, self.resolve)
        self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "indeterminate")
        self.assertEqual(len(self.files("tmp")), 1)
        self.assertEqual(self.disk(), b'{"x": 1}')  # never overwritten automatically

    def test_crash_before_journal_leaves_orphan_tmp_removed_only_when_old(self):
        self.crash_at("S6")
        self.assertEqual(len(self.files("tmp")), 1)
        tx.recover(self.dir, self.resolve)
        self.assertEqual(len(self.files("tmp")), 1)  # too young: kept
        tx.recover(self.dir, self.resolve, now_ts=os.path.getmtime(
            os.path.join(self.paths.tmp_dir, self.files("tmp")[0])) + tx.ORPHAN_TMP_MAX_AGE_SECONDS + 1)
        self.assertEqual(self.files("tmp"), [])
        self.assertEqual(self.disk(), self.src)

    def test_query_unknown_when_request_never_arrived(self):
        self.assertEqual(tx.query_txn(self.dir, "txn-00000009", self.resolve), {"state": "unknown"})


class BackupPruneTests(Base):
    def test_keeps_newest_two_and_never_prunes_with_prepared_journal(self):
        d = self.paths.backup_dir(PID)
        os.makedirs(d)
        for i in range(4):
            open(os.path.join(d, f"2026010{i}T000000Z_{'a' * 32}.bak"), "wb").close()
        tx.prune_backups(self.paths, PID)
        self.assertEqual(len(os.listdir(d)), 2)
        self.assertEqual(sorted(os.listdir(d))[0][:9], "20260102T")
        for i in range(4, 7):
            open(os.path.join(d, f"2026010{i}T000000Z_{'b' * 32}.bak"), "wb").close()
        self.paths.ensure()
        tx.write_journal(self.paths, "txn-0000000p", {"txnId": "txn-0000000p", "projectId": PID, "state": "prepared"})
        tx.prune_backups(self.paths, PID)
        self.assertEqual(len(os.listdir(d)), 5)


if __name__ == "__main__":
    unittest.main()
