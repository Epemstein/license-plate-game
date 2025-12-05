import json
from collections import Counter
import math

WORDS_FILE = "words.txt"
OUT_FILE = "plate_difficulty.json"


def load_words():
    """Load and clean words from words.txt"""
    words = []
    with open(WORDS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            w = line.strip().lower()
            if not w:
                continue
            if not w.isalpha():
                continue
            if len(w) < 3:
                continue
            words.append(w)
    print(f"Loaded {len(words)} words.")
    return words


def build_counts(words):
    """
    Loop over words and generate all possible 3-letter plates (i<j<k)
    with distinct letters that can be formed from each word.
    For each such plate, increment its count.
    """
    counts = Counter()

    for idx, w in enumerate(words):
        upper = w.upper()
        L = len(upper)
        if L < 3:
            continue

        # Generate all combinations i<j<k
        for i in range(L - 2):
            a = upper[i]
            for j in range(i + 1, L - 1):
                b = upper[j]
                for k in range(j + 1, L):
                    c = upper[k]

                    # Skip plates with repeated letters
                    if a == b or a == c or b == c:
                        continue

                    plate = a + b + c
                    counts[plate] += 1

        if (idx + 1) % 10000 == 0:
            print(f"Processed {idx + 1} words...")

    print(f"Computed counts for {len(counts)} distinct plates with at least one match.")
    return counts


def difficulty_for_count(c):
    """
    Convert a viable word count (c) into a difficulty score from 1–100.

    Anchors (in rough terms):
        1 word      -> 100
        ~100 words  -> 95
        ~1,000      -> 75
        ~10,000     -> 20
        ~20,000     -> 1

    We interpolate piecewise in log10(count) space between these points,
    then round to the nearest integer in [1, 100].

    0-count plates return 0 because they're unusable in the game.
    """
    if c <= 0:
        return 0  # unusable

    # Exact hardest case
    if c == 1:
        return 100

    # Use log10 for smooth scaling
    x = math.log10(c)

    # Segment boundaries in log10 space:
    # 1       -> x = 0
    # 100     -> x = 2
    # 1000    -> x = 3
    # 10000   -> x = 4
    # 20000   -> x = log10(20000)
    x1 = 0.0
    x2 = 2.0
    x3 = 3.0
    x4 = 4.0
    x5 = math.log10(20000.0)

    def lerp(x_val, xa, xb, ya, yb):
        """Linear interpolation from (xa,ya) to (xb,yb) at x_val."""
        if xb == xa:
            return ya
        t = (x_val - xa) / (xb - xa)
        return ya + t * (yb - ya)

    # Piecewise interpolation across the defined segments
    if x <= x2:
        # From 1 word (x=0, 100) to 100 words (x=2, 95)
        y = lerp(x, x1, x2, 100.0, 95.0)
    elif x <= x3:
        # From 100 words (x=2, 95) to 1,000 words (x=3, 75)
        y = lerp(x, x2, x3, 95.0, 75.0)
    elif x <= x4:
        # From 1,000 words (x=3, 75) to 10,000 words (x=4, 20)
        y = lerp(x, x3, x4, 75.0, 20.0)
    elif x <= x5:
        # From 10,000 words (x=4, 20) to 20,000 words (x~4.301, 1)
        y = lerp(x, x4, x5, 20.0, 1.0)
    else:
        # Anything beyond 20,000 viable words is basically trivial
        y = 1.0

    # Round and clamp to [1, 100]
    score = int(round(y))
    if score < 1:
        score = 1
    if score > 100:
        score = 100
    return score


def main():
    words = load_words()
    counts = build_counts(words)

    # Generate ALL 3-letter plates with distinct letters (26*25*24 = 15,600)
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    all_plates = []
    for a in letters:
        for b in letters:
            if b == a:
                continue
            for c in letters:
                if c == a or c == b:
                    continue
                all_plates.append(a + b + c)

    print(f"Generated {len(all_plates)} possible plates.")

    data = {}
    for p in all_plates:
        c = counts.get(p, 0)
        d = difficulty_for_count(c)
        data[p] = {"count": c, "difficulty": d}

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)

    print(f"Wrote {OUT_FILE} with {len(data)} plates.")


if __name__ == "__main__":
    main()
