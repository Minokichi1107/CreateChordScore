"""Pure validation and serialization helpers for Section-only analysis saves.

This module deliberately does not perform file I/O or mutate the authoritative
analysis file. Transactional persistence belongs to the later W2 layer.
"""
from __future__ import annotations
import copy
import hashlib
import json
from typing import Any


class SectionSaveValidationError(ValueError):
    """Raised when an analysis candidate violates the Section-save contract."""


def sha256_hex(data: bytes) -> str:
    """Return the lowercase SHA-256 digest for an exact byte sequence."""
    return hashlib.sha256(data).hexdigest()


def parse_analysis_bytes(data: bytes) -> dict[str, Any]:
    """Decode a UTF-8 JSON analysis document without changing its source bytes."""
    try:
        value = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SectionSaveValidationError("invalid-json") from exc
    if not isinstance(value, dict):
        raise SectionSaveValidationError("invalid-json")
    return value


def serialize_analysis_like_source(source_bytes: bytes, value: dict[str, Any]) -> bytes:
    """Serialize JSON with the source's newline convention and no trailing newline."""
    try:
        source_text = source_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SectionSaveValidationError("invalid-json") from exc
    newline = "\r\n" if "\r\n" in source_text else "\n"
    text = json.dumps(value, ensure_ascii=False, indent=2)
    if newline == "\r\n":
        text = text.replace("\n", "\r\n")
    bom = b"\xef\xbb\xbf" if source_bytes.startswith(b"\xef\xbb\xbf") else b""
    return bom + text.encode("utf-8")


def _section_error(index: int, reason: str) -> SectionSaveValidationError:
    return SectionSaveValidationError(f"section[{index}]:{reason}")


def validate_sections(sections: Any, chords: Any) -> None:
    """Validate Section shape, identity uniqueness, chord references and ordering."""
    if not isinstance(sections, list):
        raise SectionSaveValidationError("sections-not-array")
    if not isinstance(chords, list):
        raise SectionSaveValidationError("chords-not-array")

    chord_ids: list[str] = []
    for i, chord in enumerate(chords):
        if not isinstance(chord, dict) or not isinstance(chord.get("_id"), str) or not chord["_id"]:
            raise SectionSaveValidationError(f"chord[{i}]:missing-id")
        chord_ids.append(chord["_id"])
    if len(set(chord_ids)) != len(chord_ids):
        raise SectionSaveValidationError("duplicate-chord-id")

    positions = {chord_id: index for index, chord_id in enumerate(chord_ids)}
    section_ids: set[str] = set()
    required = ("id", "type", "name", "startChordId", "endChordId")
    for i, section in enumerate(sections):
        if not isinstance(section, dict):
            raise _section_error(i, "not-object")
        unknown_keys = set(section) - set(required)
        if unknown_keys:
            raise _section_error(i, "unknown-key")
        for key in required:
            if not isinstance(section.get(key), str) or not section[key].strip():
                raise _section_error(i, f"invalid-{key}")
        if section["id"] in section_ids:
            raise _section_error(i, "duplicate-id")
        section_ids.add(section["id"])
        start_id = section["startChordId"]
        end_id = section["endChordId"]
        if start_id not in positions:
            raise _section_error(i, "start-not-found")
        if end_id not in positions:
            raise _section_error(i, "end-not-found")
        if positions[start_id] > positions[end_id]:
            raise _section_error(i, "start-after-end")


def _strict_json_equal(left: Any, right: Any) -> bool:
    """Compare JSON values without Python's bool/int equality ambiguity.

    Object key order is also checked because serialization must retain the source
    key order outside the explicitly mutable fields.
    """
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return list(left.keys()) == list(right.keys()) and all(
            _strict_json_equal(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _strict_json_equal(a, b) for a, b in zip(left, right)
        )
    return left == right


def validate_analysis_candidate(
    original: dict[str, Any],
    candidate: dict[str, Any],
    expected_project_id: str,
    *,
    allow_generated_at_update: bool = False,
) -> None:
    """Validate a Section candidate's preservation invariant.

    By default only raw.sections and raw.provenance may change. The server-save
    layer may explicitly allow the server-issued top-level generatedAt timestamp
    to change; the pure candidate builder does not enable that exception.
    """
    if not isinstance(original, dict) or not isinstance(candidate, dict):
        raise SectionSaveValidationError("analysis-not-object")
    for key in ("version", "projectId", "generatedAt", "raw", "repairRule"):
        if key not in original or key not in candidate:
            raise SectionSaveValidationError(f"missing-top-level-{key}")
    if original.get("projectId") != expected_project_id:
        raise SectionSaveValidationError("project-id-mismatch")
    if candidate.get("projectId") != expected_project_id:
        raise SectionSaveValidationError("candidate-project-id-mismatch")

    old_raw = original.get("raw")
    new_raw = candidate.get("raw")
    if not isinstance(old_raw, dict) or not isinstance(new_raw, dict):
        raise SectionSaveValidationError("raw-not-object")
    for key in ("chords", "beats", "downbeats", "timeSignature", "bpm", "meta"):
        if key in old_raw and new_raw.get(key) != old_raw[key]:
            raise SectionSaveValidationError(f"unexpected-raw-change-{key}")
    if candidate.get("repairRule") != original.get("repairRule"):
        raise SectionSaveValidationError("repair-rule-changed")

    if allow_generated_at_update:
        if not isinstance(candidate.get("generatedAt"), str) or not candidate["generatedAt"].strip():
            raise SectionSaveValidationError("candidate-generated-at-invalid")

    old_compare = copy.deepcopy(original)
    new_compare = copy.deepcopy(candidate)
    old_compare_raw = old_compare.get("raw")
    new_compare_raw = new_compare.get("raw")
    old_compare_raw.pop("sections", None)
    new_compare_raw.pop("sections", None)
    old_compare_raw.pop("provenance", None)
    new_compare_raw.pop("provenance", None)
    if allow_generated_at_update:
        old_compare.pop("generatedAt", None)
        new_compare.pop("generatedAt", None)
    if not _strict_json_equal(old_compare, new_compare):
        raise SectionSaveValidationError("unexpected-analysis-change")

    validate_sections(new_raw.get("sections"), new_raw.get("chords"))


def build_section_candidate(
    original: dict[str, Any],
    expected_project_id: str,
    sections: Any,
    provenance_patch: Any,
) -> dict[str, Any]:
    """Build a detached candidate, replacing only raw.sections and raw.provenance.

    Existing provenance fields are retained unless explicitly supplied. The
    existing hasContentEdit and externalCheck fields are always preserved, while
    hasStructureEdit is derived from the resulting Section count.
    """
    if not isinstance(original, dict):
        raise SectionSaveValidationError("analysis-not-object")
    if original.get("projectId") != expected_project_id:
        raise SectionSaveValidationError("project-id-mismatch")
    raw = original.get("raw")
    if not isinstance(raw, dict):
        raise SectionSaveValidationError("raw-not-object")
    if "sections" not in raw:
        raise SectionSaveValidationError("not-eligible-sections-missing")
    if not isinstance(raw["sections"], list):
        raise SectionSaveValidationError("not-eligible-sections-not-array")
    if raw["sections"]:
        raise SectionSaveValidationError("not-eligible-sections-existing")
    if not isinstance(original.get("generatedAt"), str) or not original["generatedAt"].strip():
        raise SectionSaveValidationError("not-eligible-generated-at-missing")
    if not isinstance(provenance_patch, dict):
        raise SectionSaveValidationError("provenance-not-object")
    if set(provenance_patch) - {"hasStructureEdit"}:
        raise SectionSaveValidationError("provenance-patch-key-not-allowed")
    if not isinstance(sections, list):
        raise SectionSaveValidationError("sections-not-array")
    if len(sections) == 0:
        raise SectionSaveValidationError("empty-generated-sections")

    candidate = copy.deepcopy(original)
    candidate_raw = candidate["raw"]
    candidate_raw["sections"] = copy.deepcopy(sections)

    old_provenance = raw.get("provenance")
    if old_provenance is None:
        old_provenance = {}
    if not isinstance(old_provenance, dict):
        raise SectionSaveValidationError("existing-provenance-not-object")
    provenance = copy.deepcopy(old_provenance)
    preserved_keys = ("hasContentEdit", "externalCheck")
    for key in preserved_keys:
        if key in old_provenance:
            provenance[key] = copy.deepcopy(old_provenance[key])
        else:
            provenance.pop(key, None)
    provenance["hasStructureEdit"] = len(candidate_raw["sections"]) > 0
    candidate_raw["provenance"] = provenance

    validate_analysis_candidate(original, candidate, expected_project_id)
    return candidate
