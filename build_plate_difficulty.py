import json
from collections import Counter

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
    Returns difficulty in [0,1].

    1.0 = brutally hard (few viable words)
    0.0 = easiest (tons of viable words)

    0-count plates (no valid words) get 0.0 here because you
    won't actually use those plates in the game.
    """
    if c <= 0:
        return 0.0

    # Hand-tuned buckets to reflect how nasty low counts really are.
    if c == 1:
        score = 100
    elif c == 2:
        score = 98
    elif c <= 5:
        score = 96
    elif c <= 10:
        score = 94
    elif c <= 25:
        score = 92
    elif c <= 50:
        score = 90
    elif c <= 100:
        score = 88
    elif c <= 250:
        score = 85
    elif c <= 500:
        score = 80
    elif c <= 1000:
        score = 75
    elif c <= 2500:
        score = 65
    else:
        score = 50

    return score / 100.0


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
