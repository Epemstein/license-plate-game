import json
from collections import Counter
import bisect

WORDS_FILE = "words.txt"
OUT_FILE = "plate_difficulty.json"


def load_words():
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
    Instead of looping over all plates for each word (very slow),
    we loop over words and generate all possible 3-letter plates
    that can come from that word (combinations of positions).
    """
    counts = Counter()
    dict_words = {w.upper() for w in words}

    for idx, w in enumerate(words):
        upper = w.upper()
        L = len(upper)
        if L < 3:
            continue

        # Generate all i<j<k combinations of positions
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

    # Build a sorted list of POSITIVE counts only (c > 0) for percentile calc
    all_values = [counts.get(p, 0) for p in all_plates]
    positive_vals = sorted(v for v in all_values if v > 0)
    n_pos = len(positive_vals)
    
    def percentile_for_count(x):
        """
        Difficulty percentile:
          - 0-count plates -> 0.0 (unviable / not in distribution)
          - Among x > 0, lower counts = harder = HIGHER percentile.
    
        So:
          count = 1  -> percentile ~ 1.0 (hardest)
          count = max -> percentile ~ 0.0 (easiest)
        """
        if x <= 0 or n_pos <= 1:
            return 0.0
    
        # rank of x among positive counts (ascending)
        pos = bisect.bisect_left(positive_vals, x)
    
        # Convert to difficulty percentile (invert: smaller count = higher difficulty)
        return 1.0 - (pos / (n_pos - 1))

    data = {}
    for p in all_plates:
        c = counts.get(p, 0)
        pct = percentile_for_count(c)
        data[p] = {"count": c, "percentile": pct}

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)

    print(f"Wrote {OUT_FILE} with {len(data)} plates.")


if __name__ == "__main__":
    main()
