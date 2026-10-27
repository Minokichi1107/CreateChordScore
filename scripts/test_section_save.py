import copy
import unittest

from section_save import (
    SectionSaveValidationError,
    build_section_candidate,
    parse_analysis_bytes,
    serialize_analysis_like_source,
    sha256_hex,
    validate_analysis_candidate,
    validate_sections,
)


def analysis_fixture():
    return {
        "version": 1,
        "projectId": "project-1",
        "generatedAt": "2026-10-27T00:00:00.000Z",
        "raw": {
            "chords": [{"_id": "c1", "start": 0, "end": 1}, {"_id": "c2", "start": 1, "end": 2}],
            "beats": [0, 1],
            "downbeats": [0],
            "timeSignature": {"numerator": 4, "denominator": 4},
            "bpm": 120,
            "meta": {"title": "test"},
            "sections": [],
            "provenance": {"hasContentEdit": True, "hasStructureEdit": False, "externalCheck": {"checked": True}},
        },
        "repairRule": None,
        "unknownTopLevel": {"preserve": True},
    }


class SectionSaveLibraryTests(unittest.TestCase):
    def test_hash_uses_exact_bytes(self):
        self.assertEqual(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        self.assertNotEqual(sha256_hex(b"{}\n"), sha256_hex(b"{}"))

    def test_parse_rejects_non_object_and_invalid_json(self):
        with self.assertRaises(SectionSaveValidationError):
            parse_analysis_bytes(b"[]")
        with self.assertRaises(SectionSaveValidationError):
            parse_analysis_bytes(b"{broken")

    def test_serialization_preserves_crlf_and_no_final_newline(self):
        source = b'{\r\n  "a": 1\r\n}'
        encoded = serialize_analysis_like_source(source, {"a": 2})
        self.assertEqual(encoded, b'{\r\n  "a": 2\r\n}')
        self.assertFalse(encoded.endswith(b"\n\n"))
        self.assertNotIn(b"\n", encoded.replace(b"\r\n", b""))

    def test_serialization_preserves_utf8_bom(self):
        source = b'\xef\xbb\xbf{\n  "a": 1\n}'
        encoded = serialize_analysis_like_source(source, {"a": 2})
        self.assertTrue(encoded.startswith(b"\xef\xbb\xbf"))
        self.assertEqual(parse_analysis_bytes(encoded), {"a": 2})

    def test_candidate_validation_allows_explicit_generated_at_update(self):
        original = analysis_fixture()
        candidate = copy.deepcopy(original)
        candidate["raw"]["sections"] = [{
            "id": "s1", "type": "verse", "name": "Verse 1",
            "startChordId": "c1", "endChordId": "c2",
        }]
        candidate["raw"]["provenance"]["hasStructureEdit"] = True
        candidate["generatedAt"] = "2026-10-28T00:00:00.000Z"
        with self.assertRaisesRegex(SectionSaveValidationError, "unexpected-analysis-change"):
            validate_analysis_candidate(original, candidate, "project-1")
        validate_analysis_candidate(
            original, candidate, "project-1", allow_generated_at_update=True
        )

    def test_candidate_validation_detects_boolean_number_type_change(self):
        original = analysis_fixture()
        original["unknownTopLevel"] = {"value": 1}
        candidate = copy.deepcopy(original)
        candidate["unknownTopLevel"]["value"] = True
        with self.assertRaisesRegex(SectionSaveValidationError, "unexpected-analysis-change"):
            validate_analysis_candidate(original, candidate, "project-1")

    def test_build_candidate_changes_only_sections_and_provenance(self):
        original = analysis_fixture()
        before = copy.deepcopy(original)
        sections = [{
            "id": "s1", "type": "verse", "name": "Verse 1",
            "startChordId": "c1", "endChordId": "c2",
        }]
        candidate = build_section_candidate(original, "project-1", sections, {})
        self.assertEqual(original, before)
        self.assertEqual(candidate["raw"]["sections"], sections)
        self.assertTrue(candidate["raw"]["provenance"]["hasContentEdit"])
        self.assertEqual(candidate["raw"]["provenance"]["externalCheck"], {"checked": True})
        self.assertTrue(candidate["raw"]["provenance"]["hasStructureEdit"])
        self.assertEqual(candidate["unknownTopLevel"], original["unknownTopLevel"])
        validate_analysis_candidate(original, candidate, "project-1")

    def test_sections_missing_is_not_treated_as_empty(self):
        original = analysis_fixture()
        del original["raw"]["sections"]
        with self.assertRaisesRegex(SectionSaveValidationError, "sections-missing"):
            build_section_candidate(original, "project-1", [], {})

    def test_existing_sections_block_candidate(self):
        original = analysis_fixture()
        original["raw"]["sections"] = [{"id": "existing"}]
        with self.assertRaisesRegex(SectionSaveValidationError, "sections-existing"):
            build_section_candidate(original, "project-1", [], {})

    def test_section_reference_and_order_validation(self):
        chords = [{"_id": "c1"}, {"_id": "c2"}]
        good = [{"id": "s1", "type": "verse", "name": "Verse", "startChordId": "c1", "endChordId": "c2"}]
        validate_sections(good, chords)
        bad = [dict(good[0], startChordId="missing")]
        with self.assertRaisesRegex(SectionSaveValidationError, "start-not-found"):
            validate_sections(bad, chords)
        reversed_section = [dict(good[0], startChordId="c2", endChordId="c1")]
        with self.assertRaisesRegex(SectionSaveValidationError, "start-after-end"):
            validate_sections(reversed_section, chords)

    def test_unknown_section_keys_rejected(self):
        section = {
            "id": "s1", "type": "verse", "name": "Verse",
            "startChordId": "c1", "endChordId": "c1", "evil": {"x": 1},
        }
        with self.assertRaisesRegex(SectionSaveValidationError, "unknown-key"):
            validate_sections([section], [{"_id": "c1"}])

    def test_unknown_provenance_patch_keys_rejected(self):
        original = analysis_fixture()
        section = [{
            "id": "s1", "type": "verse", "name": "Verse",
            "startChordId": "c1", "endChordId": "c2",
        }]
        with self.assertRaisesRegex(SectionSaveValidationError, "provenance-patch-key-not-allowed"):
            build_section_candidate(original, "project-1", section, {"source": "evil", "x": 1})

    def test_empty_generated_sections_rejected(self):
        original = analysis_fixture()
        with self.assertRaisesRegex(SectionSaveValidationError, "empty-generated-sections"):
            build_section_candidate(original, "project-1", [], {})

    def test_missing_or_null_provenance_builds_only_derived_field(self):
        section = [{
            "id": "s1", "type": "verse", "name": "Verse",
            "startChordId": "c1", "endChordId": "c2",
        }]
        for absent in ("missing", "null"):
            original = analysis_fixture()
            if absent == "missing":
                del original["raw"]["provenance"]
            else:
                original["raw"]["provenance"] = None
            candidate = build_section_candidate(original, "project-1", section, {})
            self.assertEqual(candidate["raw"]["provenance"], {"hasStructureEdit": True})

    def test_duplicate_section_ids_rejected(self):
        section = {"id": "s1", "type": "verse", "name": "Verse", "startChordId": "c1", "endChordId": "c1"}
        with self.assertRaisesRegex(SectionSaveValidationError, "duplicate-id"):
            validate_sections([section, dict(section)], [{"_id": "c1"}])


if __name__ == "__main__":
    unittest.main()
