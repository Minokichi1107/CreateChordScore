#!/usr/bin/env python3
"""Reference implementation of the Section boundary detector (algorithm sbd-0.2).

This is the independent (numpy) implementation that js/sectionBoundaryDetection.js is
checked against by scripts/test-section-auto-generation.mjs. The JS test reads the
expected values stored in scripts/fixtures/section-boundary/songs.json; this script
regenerates them.

    python3 scripts/section_boundary_reference.py --check   # recompute and compare (default)
    python3 scripts/section_boundary_reference.py --write   # rewrite expected values

Requires numpy. Bar grid used for the cross-check ("raw grid"):
    bar i = [downbeats[i], downbeats[i+1]); the last bar ends at the last chord's end.
Keep this file and the JS module in step; bump ALGORITHM_VERSION in both.
"""
import json
import math
import os
import re
import sys

import numpy as np

ALGORITHM_VERSION = "sbd-0.2"
SHORT_WINDOW, LONG_WINDOW = 4, 8
PEAK_RADIUS = SHORT_WINDOW // 2
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "section-boundary", "songs.json")
FLAT_TO_SHARP = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}


def simplify(name):
    if not isinstance(name, str) or name == "N":
        return None
    m = re.match(r"^([A-G][#b]?)(.*)$", name)
    if not m:
        return None
    root, quality = m.group(1), m.group(2).split("/")[0]
    minor = quality.startswith("m") and not quality.startswith("maj")
    return FLAT_TO_SHARP.get(root, root) + ("m" if minor else "")


def raw_grid(downbeats, chords):
    edges = list(downbeats) + [chords[-1]["end"]]
    return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]


def bar_vectors(chords, intervals):
    simplified = [simplify(c["chord"]) for c in chords]
    keys = sorted({k for k in simplified if k})
    index = {k: i for i, k in enumerate(keys)}
    V = np.zeros((len(intervals), len(keys)))
    for c, k in zip(chords, simplified):
        if k is None:
            continue
        for b, (s, e) in enumerate(intervals):
            overlap = min(c["end"], e) - max(c["start"], s)
            if overlap > 0:
                V[b, index[k]] += overlap
    norm = np.linalg.norm(V, axis=1, keepdims=True)
    norm[norm == 0] = 1
    return V / norm


def cosine(a, b):
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / d) if d > 0 else 0.0


def sequence_novelty(V, W):
    n = len(V)
    s = np.zeros(n)
    for b in range(1, n):
        w = min(W, b, n - b)
        if w < 2:
            continue
        s[b] = 1 - np.mean([cosine(V[b - w + i], V[b + i]) for i in range(w)])
    return s


def repeat_score(V, L=4):
    n = len(V)
    S = V @ V.T
    s = np.zeros(n)
    for b in range(2, n - 1):
        l = min(L, n - b)
        if l < 3:
            continue
        best = 0.0
        for a in range(0, b - L + 1):
            fwd = np.mean([S[a + i, b + i] for i in range(l)])
            prev = S[a - 1, b - 1] if a > 0 else 0.0
            best = max(best, fwd - 0.8 * max(0.0, prev))
        s[b] = best
    return s


def normalize(x):
    m = x.max() if len(x) else 0
    return x / m if m > 0 else x


def scores(V):
    return (normalize(sequence_novelty(V, LONG_WINDOW))
            + normalize(sequence_novelty(V, SHORT_WINDOW))
            + normalize(repeat_score(V)))


def tie_key(v):
    return math.floor(v * 1e9 + 0.5)


def is_local_peak(score, b, radius):
    here = tie_key(score[b])
    for d in range(-radius, radius + 1):
        j = b + d
        if d == 0 or j < 0 or j >= len(score):
            continue
        other = tie_key(score[j])
        if other > here or (other == here and j < b):
            return False
    return True


def detect(score, n, peak_radius=PEAK_RADIUS, min_distance=1):
    k = max(3, round(n / 14))  # Python round(): halves to even (JS side emulates it)
    order = sorted(range(len(score)), key=lambda b: (-tie_key(score[b]), b))
    picked = []
    for b in order:
        if b < 2 or score[b] <= 0:
            continue
        if not is_local_peak(score, b, peak_radius):
            continue
        if all(abs(b - x) >= min_distance for x in picked):
            picked.append(b)
        if len(picked) >= k:
            break
    return sorted(picked)


def compute(song):
    chords = song["chords"]
    V = bar_vectors(chords, raw_grid(song["downbeats"], chords))
    sc = scores(V)
    return {
        "scores": [round(float(x), 9) for x in sc],
        "bars": detect(sc, len(V)),
    }


def main(argv):
    mode = "--write" if "--write" in argv else "--check"
    with open(FIXTURE, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("algorithmVersion") != ALGORITHM_VERSION and mode == "--check":
        print(f"fixture was generated for {data.get('algorithmVersion')}, reference is {ALGORITHM_VERSION}")
        return 1
    mismatches = 0
    for song in data["songs"]:
        result = compute(song)
        if mode == "--write":
            song["expected"] = result
            continue
        same_bars = result["bars"] == song["expected"]["bars"]
        same_scores = all(abs(a - b) <= 1e-9 for a, b in zip(result["scores"], song["expected"]["scores"]))
        print(song["id"], "OK" if same_bars and same_scores else "MISMATCH")
        mismatches += 0 if same_bars and same_scores else 1
    if mode == "--write":
        data["algorithmVersion"] = ALGORITHM_VERSION
        with open(FIXTURE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print("expected values rewritten for", len(data["songs"]), "songs")
        return 0
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
