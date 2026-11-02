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

    def assertUntouched(self, tmp_kept=0):
        """The authoritative file is unchanged. A tmp is deleted only when its own write broke
        (D1); every other failure keeps it as evidence (`tmp_kept` files)."""
        self.assertEqual(self.disk(), self.src)
        self.assertEqual(len(self.files("tmp")), tmp_kept)

    def test_d1_tmp_write_failure(self):
        self.assertFails("write-failed", hooks={"S4": self.raiser(OSError("disk full"))})
        self.assertUntouched()

    def test_d2_readback_mismatch(self):
        orig = tx.write_synced
        tx.write_synced = lambda p, d, **k: orig(p, d[:-1] + b" ", **k)
        self.addCleanup(setattr, tx, "write_synced", orig)
        self.assertFails("verify-failed")
        self.assertUntouched(tmp_kept=1)

    def test_d3_backup_failure(self):
        orig = tx.create_backup
        tx.create_backup = lambda *a, **k: (_ for _ in ()).throw(tx.TxnError("backup-failed"))
        self.addCleanup(setattr, tx, "create_backup", orig)
        self.assertFails("backup-failed")
        self.assertUntouched(tmp_kept=1)

    def test_d4_journal_failure(self):
        orig = tx.write_journal
        tx.write_journal = lambda *a, **k: (_ for _ in ()).throw(OSError("nope"))
        self.addCleanup(setattr, tx, "write_journal", orig)
        self.assertFails("journal-failed")
        self.assertUntouched(tmp_kept=1)

    def test_d5_external_change_before_replace(self):
        changed = self.src.replace(b"120", b"121")

        def external_write():
            with open(self.path, "wb") as f:
                f.write(changed)
        err = self.assertFails("conflict", hooks={"S8": external_write})
        self.assertEqual(err.state, "aborted")
        self.assertEqual(self.disk(), changed)
        self.assertEqual(len(self.files("tmp")), 1)  # kept as evidence

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
        self.assertEqual(len(self.files("tmp")), 1)  # kept as evidence
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
        self.assertEqual(len(self.files("tmp")), 1)  # kept as evidence
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

    def test_crash_before_journal_leaves_orphan_tmp_that_is_never_deleted(self):
        self.crash_at("S6")
        name = self.files("tmp")[0]
        before = open(os.path.join(self.paths.tmp_dir, name), "rb").read()
        tx.recover(self.dir, self.resolve)
        tx.recover(self.dir, self.resolve, now_ts=os.path.getmtime(
            os.path.join(self.paths.tmp_dir, name)) + 10 ** 7)  # however old
        self.assertEqual(self.files("tmp"), [name])
        self.assertEqual(open(os.path.join(self.paths.tmp_dir, name), "rb").read(), before)
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


class PreservationTests(Base):
    """縮小版: evidence of an earlier failure is never deleted, moved or overwritten."""

    def read(self, path):
        with open(path, "rb") as f:
            return f.read()

    def test_failed_tmp_write_deletes_only_its_own_incomplete_tmp(self):
        def partial(path, data, **kw):
            with open(path, "wb") as f:
                f.write(data[:5])
            raise OSError("disk full")
        orig = tx.write_synced
        tx.write_synced = partial
        self.addCleanup(setattr, tx, "write_synced", orig)
        self.assertFails("write-failed")
        self.assertEqual(self.files("tmp"), [])
        self.assertEqual(self.disk(), self.src)

    def test_tmp_created_by_someone_else_during_s4_is_kept(self):
        def foreign():
            os.makedirs(self.paths.tmp_dir, exist_ok=True)
            with open(self.paths.tmp("txn-00000001"), "wb") as f:
                f.write(b"someone else")
        self.assertFails("tmp-exists", txn_id="txn-00000001", hooks={"S4": foreign})
        self.assertEqual(self.read(self.paths.tmp("txn-00000001")), b"someone else")

    def test_recover_never_deletes_tmp_or_indeterminate_journal(self):
        foreign = b'{"someone":"else"}'

        def clobber(src, dst):
            with open(dst, "wb") as f:
                f.write(foreign)
            raise OSError("boom")
        self.assertFails("indeterminate", replace_fn=clobber)
        snapshot = {n: self.read(os.path.join(self.paths.root, "tmp", n)) for n in self.files("tmp")}
        journal_before = self.read(self.paths.journal("txn-00000001"))
        tx.recover(self.dir, self.resolve)
        self.assertEqual(tx.query_txn(self.dir, "txn-00000001", self.resolve)["state"], "indeterminate")
        self.assertEqual(self.read(self.paths.journal("txn-00000001")), journal_before)
        self.assertEqual({n: self.read(os.path.join(self.paths.root, "tmp", n)) for n in self.files("tmp")}, snapshot)
        self.assertEqual(self.disk(), foreign)

    def test_write_journal_never_deletes_an_existing_part_file(self):
        self.paths.ensure()
        part = self.paths.journal("txn-00000001") + ".part"
        with open(part, "wb") as f:
            f.write(b"evidence")
        with self.assertRaises(FileExistsError):
            tx.write_journal(self.paths, "txn-00000001", {"state": "prepared"})
        self.assertEqual(self.read(part), b"evidence")

    def test_write_journal_keeps_part_when_replace_fails(self):
        self.paths.ensure()
        orig = tx.os.replace
        tx.os.replace = lambda *a: (_ for _ in ()).throw(PermissionError("locked"))
        try:
            with self.assertRaises(PermissionError):
                tx.write_journal(self.paths, "txn-00000001", {"state": "prepared"})
        finally:
            tx.os.replace = orig
        self.assertTrue(os.path.exists(self.paths.journal("txn-00000001") + ".part"))

    def test_create_backup_never_deletes_an_existing_bak_part(self):
        directory = self.paths.backup_dir(PID)
        os.makedirs(directory)
        import datetime
        fixed = lambda: datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        part = os.path.join(directory, f"{tx.utc_stamp(fixed)}_{self.h0[:32]}.bak.part")
        with open(part, "wb") as f:
            f.write(b"evidence")
        with self.assertRaises(tx.TxnError) as ctx:
            tx.create_backup(self.paths, PID, self.h0, self.src, fixed)
        self.assertEqual((ctx.exception.reason, ctx.exception.detail), ("backup-failed", "bak-part-present"))
        self.assertEqual(self.read(part), b"evidence")

    def test_failed_backup_deletes_only_its_own_unverified_file(self):
        directory = self.paths.backup_dir(PID)
        os.makedirs(directory)
        older = os.path.join(directory, "20250101T000000Z_" + "a" * 32 + ".bak")
        with open(older, "wb") as f:
            f.write(b"older verified backup")
        orig = tx.read_bytes
        tx.read_bytes = lambda path: b"corrupted"
        self.addCleanup(setattr, tx, "read_bytes", orig)
        with self.assertRaises(tx.TxnError):
            tx.create_backup(self.paths, PID, self.h0, self.src)
        tx.read_bytes = orig
        self.assertEqual(os.listdir(directory), [os.path.basename(older)])
        self.assertEqual(self.read(older), b"older verified backup")


class LeftoverGuardTests(Base):
    """縮小版: leftovers stop a NEW save and change nothing."""

    def snapshot(self):
        out = {}
        for root, _dirs, names in os.walk(self.paths.root):
            for n in names:
                full = os.path.join(root, n)
                with open(full, "rb") as f:
                    out[os.path.relpath(full, self.paths.root)] = f.read()
        return out

    def assertStopped(self, reason, detail=None):
        before, disk = self.snapshot(), self.disk()
        err = self.assertFails(reason)
        if detail:
            self.assertEqual(err.detail.split(":")[0], detail)
        self.assertEqual(self.snapshot(), before)  # nothing created, deleted or changed
        self.assertEqual(self.disk(), disk)

    def test_tmp_without_journal_stops_the_same_txn_id_only(self):
        self.paths.ensure()
        with open(self.paths.tmp("txn-00000001"), "wb") as f:
            f.write(b"unsaved edits")
        self.assertStopped_for("txn-00000001", "tmp-exists")
        self.save(txn_id="txn-00000002")  # another txnId is not blocked

    def assertStopped_for(self, txn_id, reason):
        before = self.snapshot()
        self.assertFails(reason, txn_id=txn_id)
        self.assertEqual(self.snapshot(), before)

    def test_journal_part_stops_every_project(self):
        self.paths.ensure()
        with open(self.paths.journal("txn-0000000x") + ".part", "wb") as f:
            f.write(b"")
        self.assertStopped("journal-corrupt", "part-present")

    def test_unreadable_or_invalid_journal_is_not_treated_as_missing(self):
        self.paths.ensure()
        for content, kind in ((b"not json", "corrupt"), (b'{"state":"bogus"}', "invalid")):
            with self.subTest(kind=kind):
                path = self.paths.journal("txn-0000000x")
                with open(path, "wb") as f:
                    f.write(content)
                self.assertEqual(tx.inspect_journal(self.paths, "txn-0000000x")[0], kind)
                self.assertStopped("journal-corrupt", kind)
                os.remove(path)
        os.makedirs(self.paths.journal("txn-0000000x"))  # a directory cannot be read as a file
        self.assertEqual(tx.inspect_journal(self.paths, "txn-0000000x")[0], "unreadable")
        self.assertStopped("journal-corrupt", "unreadable")

    def test_unsettled_journal_stops_only_the_same_project(self):
        self.paths.ensure()
        for state in ("prepared", "indeterminate"):
            with self.subTest(state=state):
                tx.write_journal(self.paths, "txn-0000000p", {"txnId": "txn-0000000p", "projectId": PID, "state": state})
                self.assertStopped("indeterminate")
                tx.guard_leftovers(self.paths, "another-project", "txn-0000000q")  # does not raise
                os.remove(self.paths.journal("txn-0000000p"))

    def test_bak_part_stops_only_that_project_and_is_kept(self):
        directory = self.paths.backup_dir(PID)
        os.makedirs(directory)
        with open(os.path.join(directory, "20260101T000000Z_" + "a" * 32 + ".bak.part"), "wb") as f:
            f.write(b"evidence")
        self.assertStopped("backup-failed", "bak-part-present")
        tx.guard_leftovers(self.paths, "another-project", "txn-0000000q")  # does not raise

    def test_old_committed_or_aborted_journals_do_not_block(self):
        self.save(txn_id="txn-00000001")  # committed
        self.paths.ensure()
        tx.write_journal(self.paths, "txn-0000000a", {"txnId": "txn-0000000a", "projectId": PID, "state": "aborted"})
        tx.guard_leftovers(self.paths, PID, "txn-00000009")  # does not raise


class PostVerifyAndInputTests(Base):
    def test_post_replace_check_reads_up_to_three_times(self):
        for failures, expect_ok in ((2, True), (3, False)):
            with self.subTest(failures=failures):
                calls, sleeps = [], []

                def flaky():
                    calls.append(1)
                    if len(calls) <= failures:
                        raise tx.TxnError("post-verify-failed", "busy")
                self.setUp()
                if expect_ok:
                    self.save(hooks={"S10": flaky}, sleep_fn=sleeps.append)
                else:
                    err = self.assertFails("post-verify-failed", hooks={"S10": flaky}, sleep_fn=sleeps.append)
                    self.assertEqual(err.state, "indeterminate")
                    self.assertEqual(tx.read_journal(self.paths, "txn-00000001")["state"], "indeterminate")
                self.assertEqual(len(calls), min(failures + 1, 3))
                self.assertEqual(len(sleeps), min(failures, 2))

    def test_cross_volume_and_unknown_volume_stop_before_anything_is_created(self):
        from types import SimpleNamespace
        self.paths.ensure()  # create folders first so only the volume check sees the fake stat
        real = tx.os.stat

        def only_volume_check(devs):
            def stat(path, *a, **k):
                if path == self.paths.tmp_dir:
                    return SimpleNamespace(st_dev=devs[0])
                if path == self.paths.analysis_dir:
                    return SimpleNamespace(st_dev=devs[1])
                return real(path, *a, **k)
            return stat

        def broken(path, *a, **k):
            if path == self.paths.tmp_dir:
                raise OSError("no stat")
            return real(path, *a, **k)
        cases = (((1, 2), "cross-volume"), ((0, 0), "volume-check-failed"), (None, "volume-check-failed"))
        for devs, reason in cases:
            with self.subTest(reason=reason, devs=devs):
                tx.os.stat = only_volume_check(devs) if devs else broken
                real_ensure, tx.TxnPaths.ensure = tx.TxnPaths.ensure, lambda self_: None  # folders already exist
                try:
                    self.assertFails(reason)
                finally:
                    tx.os.stat = real
                    tx.TxnPaths.ensure = real_ensure
                self.assertEqual(self.files("tmp") + self.files("journal"), [])
                self.assertEqual(self.disk(), self.src)

    def test_non_finite_numbers_are_refused_before_anything_is_written(self):
        nan_source = self.src.replace(b'"bpm": 120', b'"bpm": NaN')
        with open(self.path, "wb") as f:
            f.write(nan_source)
        self.h0 = sha256_hex(nan_source)
        err = self.assertFails("not-eligible")
        self.assertIn("non-finite", err.detail)
        self.assertEqual(self.disk(), nan_source)
        self.assertEqual(self.files("tmp") + self.files(f"backup/{PID}"), [])

    def test_non_finite_or_unencodable_sections_are_refused(self):
        for bad in (float("nan"), float("inf"), "\ud800"):
            with self.subTest(bad=repr(bad)):
                sections = [dict(SECTIONS[0], name=bad)]
                with self.assertRaises(tx.TxnError):
                    tx.commit_section_save(self.dir, PID, "txn-0000000b", self.h0, sections, {}, resolve_fn=self.resolve)
                self.assertEqual(self.disk(), self.src)
                self.assertEqual(self.files("tmp") + self.files("journal"), [])


class RestoreDrillTests(Base):
    """縮小版: the manual procedure in docs/Phase150_W2_バックアップからの戻し方.md really works.

    The test follows the document step by step with plain file operations
    (no helper from section_txn), in a temporary folder only.
    """

    def manual_decision(self, txn_id):
        """Step 'compare before restoring': returns 'keep' | 'restore' | 'hold'."""
        journal = tx.read_journal(self.paths, txn_id)
        current = sha256_hex(self.disk())
        if journal is None:
            return "hold"                       # cannot judge -> do not overwrite anything
        if current == journal["h1"]:
            return "keep"                       # new content is already in place
        if current == journal["h0"]:
            return "keep"                       # original is already in place
        # the restore candidate must be verified in full (the file name only holds 32 hex digits)
        bak = self.latest_bak()
        if bak is None or sha256_hex(self.read_bytes(bak)) != journal["h0"]:
            return "hold"
        return "restore"

    def latest_bak(self):
        directory = self.paths.backup_dir(PID)
        names = sorted(n for n in os.listdir(directory) if os.path.isdir(directory) and n.endswith(".bak")) \
            if os.path.isdir(directory) else []
        return os.path.join(directory, names[-1]) if names else None

    def test_manual_restore_from_backup_after_a_broken_save(self):
        broken = b'{"someone":"else"'                      # not even valid JSON

        def clobber(src, dst):
            with open(dst, "wb") as f:
                f.write(broken)
            raise OSError("boom")
        self.assertFails("indeterminate", replace_fn=clobber)
        self.assertEqual(self.manual_decision("txn-00000001"), "restore")

        # 1. set the broken file aside   2. copy the newest .bak over the file   (the .bak itself stays)
        shutil.copyfile(self.path, self.path + ".broken")
        bak = self.latest_bak()
        shutil.copyfile(bak, self.path)

        self.assertEqual(self.disk(), self.src)              # byte-for-byte the original
        self.assertEqual(sha256_hex(self.disk()), self.h0)
        json.loads(self.disk().decode("utf-8-sig"))           # and it reads again
        self.assertTrue(os.path.exists(bak))                  # backup kept
        self.assertEqual(self.read_bytes(self.path + ".broken"), broken)   # evidence kept
        self.assertEqual(len(self.files("tmp")), 1)           # unsaved edits kept

    def test_do_not_restore_when_the_new_content_is_already_saved(self):
        def swap_then_raise(src, dst):
            os.replace(src, dst)
            raise OSError("late error")
        self.save(replace_fn=swap_then_raise)
        self.assertEqual(self.manual_decision("txn-00000001"), "keep")   # restoring would undo a good save

    def test_hold_when_the_backup_does_not_match_h0(self):
        broken = b'{"someone":"else"'

        def clobber(src, dst):
            with open(dst, "wb") as f:
                f.write(broken)
            raise OSError("boom")
        self.assertFails("indeterminate", replace_fn=clobber)
        with open(self.latest_bak(), "ab") as f:      # the backup itself is damaged
            f.write(b" ")
        self.assertEqual(self.manual_decision("txn-00000001"), "hold")
        self.assertEqual(self.disk(), broken)         # nothing was overwritten

    def test_hold_when_no_backup_exists(self):
        broken = b'{"someone":"else"'

        def clobber(src, dst):
            with open(dst, "wb") as f:
                f.write(broken)
            raise OSError("boom")
        self.assertFails("indeterminate", replace_fn=clobber)
        shutil.rmtree(self.paths.backup_dir(PID))     # simulate: no backup can be found
        self.assertEqual(self.manual_decision("txn-00000001"), "hold")
        self.assertEqual(self.disk(), broken)

    def test_hold_when_the_journal_cannot_be_read(self):
        self.save()
        os.remove(self.paths.journal("txn-00000001"))
        self.assertEqual(self.manual_decision("txn-00000001"), "hold")

    @staticmethod
    def read_bytes(path):
        with open(path, "rb") as f:
            return f.read()


if __name__ == "__main__":
    unittest.main()
