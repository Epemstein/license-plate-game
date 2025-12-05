import json
import math
from tqdm import tqdm

# --------------------------------------------
# Load dictionary
# --------------------------------------------
with open("words.txt", "r") as f:
    words = [w.strip().lower() for w in f.readlines() if w.strip()]

# Only keep clean words (a–z only, length >= 3)
words = [w for w in words if w.isalpha() and len(w) >= 3]

print(f"Loaded {len(words)} words.")


# --------------------------------------------
# Helper: check if a word matches a plate (SPA rule)
# --------------------------------------------
def matches_plate(plate, word):
    plate = plate.upper()
    word = word.upper()
    pi = 0

    for i, ch in enumerate(word):
        if ch == plate[pi]:
            pi += 1
            if pi == 3:
                return True
        elif ch in plate[pi+1:]:
            # Found a later plate letter too early → invalid
            return False

    return False


# --------------------------------------------
# Generate all 15,600 plate combinations (distinct letters)
# --------------------------------------------
letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
plates = []

for a in letters:
    for b in letters:
        if b == a: continue
        for c in letters:
            if c == a or c == b: continue
            plates.append(a + b + c)

print(f"Generated {len(plates)} possible plates.")


# --------------------------------------------
# Compute match counts for each plate
# --------------------------------------------
results = {}

print("Computing word counts for each plate...")
for plate in tqdm(plates):
    count = 0
    for w in words:
        if matches_plate(plate, w):
            count += 1
    results[plate] = count


# --------------------------------------------
# Compute percentiles
# --------------------------------------------
counts = sorted(results.values())
n = len(counts)

def percentile(x):
    # position of x among all counts
    rank = counts.index(x)
    return rank / (n - 1)


difficulty = {
    plate: {
        "count": results[plate],
        "percentile": percentile(results[plate])
    }
    for plate in plates
}

# --------------------------------------------
# Save to JSON
# --------------------------------------------
with open("plate_difficulty.json", "w") as f:
    json.dump(difficulty, f, indent=2)

print("Saved plate_difficulty.json!")
