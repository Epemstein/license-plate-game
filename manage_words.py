#!/usr/bin/env python3
"""
Word Dictionary Manager
Manage words.txt file - add or remove words quickly
"""

import sys
import os

def load_words(filename='words.txt'):
    """Load words from file into a set (for fast lookups and deduplication)"""
    if not os.path.exists(filename):
        print(f"Error: {filename} not found!")
        return None
    
    with open(filename, 'r', encoding='utf-8') as f:
        words = set(line.strip().lower() for line in f if line.strip())
    
    print(f"Loaded {len(words):,} words from {filename}")
    return words

def save_words(words, filename='words.txt'):
    """Save words back to file (sorted alphabetically)"""
    sorted_words = sorted(words)
    
    with open(filename, 'w', encoding='utf-8') as f:
        for word in sorted_words:
            f.write(word + '\n')
    
    print(f"Saved {len(words):,} words to {filename}")

def add_words(words_set, new_words):
    """Add new words to the set"""
    added = []
    already_exists = []
    
    for word in new_words:
        word = word.strip().lower()
        if not word:
            continue
        if word in words_set:
            already_exists.append(word)
        else:
            words_set.add(word)
            added.append(word)
    
    if added:
        print(f"\n✓ Added {len(added)} word(s):")
        for w in added:
            print(f"  + {w}")
    
    if already_exists:
        print(f"\n⚠ Already exists ({len(already_exists)} word(s)):")
        for w in already_exists[:10]:  # Show first 10
            print(f"  = {w}")
        if len(already_exists) > 10:
            print(f"  ... and {len(already_exists) - 10} more")
    
    return words_set

def remove_words(words_set, words_to_remove):
    """Remove words from the set"""
    removed = []
    not_found = []
    
    for word in words_to_remove:
        word = word.strip().lower()
        if not word:
            continue
        if word in words_set:
            words_set.remove(word)
            removed.append(word)
        else:
            not_found.append(word)
    
    if removed:
        print(f"\n✓ Removed {len(removed)} word(s):")
        for w in removed:
            print(f"  - {w}")
    
    if not_found:
        print(f"\n⚠ Not found ({len(not_found)} word(s)):")
        for w in not_found[:10]:  # Show first 10
            print(f"  ? {w}")
        if len(not_found) > 10:
            print(f"  ... and {len(not_found) - 10} more")
    
    return words_set

def check_words(words_set, words_to_check):
    """Check if words exist in the dictionary"""
    for word in words_to_check:
        word = word.strip().lower()
        if not word:
            continue
        if word in words_set:
            print(f"✓ '{word}' EXISTS in dictionary")
        else:
            print(f"✗ '{word}' NOT FOUND in dictionary")

def remove_from_file(words_set, filename):
    """Remove all words listed in a file"""
    if not os.path.exists(filename):
        print(f"Error: {filename} not found!")
        return words_set
    
    with open(filename, 'r', encoding='utf-8') as f:
        words_to_remove = [line.strip() for line in f if line.strip()]
    
    print(f"Removing {len(words_to_remove)} word(s) from {filename}...")
    return remove_words(words_set, words_to_remove)

def add_from_file(words_set, filename):
    """Add all words listed in a file"""
    if not os.path.exists(filename):
        print(f"Error: {filename} not found!")
        return words_set
    
    with open(filename, 'r', encoding='utf-8') as f:
        words_to_add = [line.strip() for line in f if line.strip()]
    
    print(f"Adding {len(words_to_add)} word(s) from {filename}...")
    return add_words(words_set, words_to_add)

def print_usage():
    """Print usage instructions"""
    print("""
Word Dictionary Manager
=======================

Usage:
  python manage_words.py <command> [arguments]

Commands:
  add <word1> [word2] ...       Add one or more words
  remove <word1> [word2] ...    Remove one or more words
  check <word1> [word2] ...     Check if words exist
  add-file <filename>           Add all words from a file (one per line)
  remove-file <filename>        Remove all words from a file (one per line)
  stats                         Show dictionary statistics

Examples:
  python manage_words.py add hello world
  python manage_words.py remove badword1 badword2
  python manage_words.py check test example
  python manage_words.py remove-file profanity.txt
  python manage_words.py add-file new_words.txt
  python manage_words.py stats

Notes:
  - All words are converted to lowercase
  - Words are saved in alphabetical order
  - Duplicates are automatically removed
  - Original file is overwritten (make a backup!)
""")

def show_stats(words_set):
    """Show statistics about the dictionary"""
    print(f"\nDictionary Statistics:")
    print(f"  Total words: {len(words_set):,}")
    
    # Length distribution
    lengths = {}
    for word in words_set:
        length = len(word)
        lengths[length] = lengths.get(length, 0) + 1
    
    print(f"\n  Words by length:")
    for length in sorted(lengths.keys())[:15]:  # Show first 15 lengths
        print(f"    {length} letters: {lengths[length]:,} words")
    if len(lengths) > 15:
        print(f"    ... and {len(lengths) - 15} more length categories")
    
    # Sample words
    sample = sorted(words_set)[:10]
    print(f"\n  First 10 words (alphabetically):")
    for word in sample:
        print(f"    {word}")

def main():
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == 'stats':
        words = load_words()
        if words is None:
            sys.exit(1)
        show_stats(words)
        return
    
    # Load words
    words = load_words()
    if words is None:
        sys.exit(1)
    
    original_count = len(words)
    modified = False
    
    # Execute command
    if command == 'add':
        if len(sys.argv) < 3:
            print("Error: Please provide at least one word to add")
            print("Usage: python manage_words.py add <word1> [word2] ...")
            sys.exit(1)
        words = add_words(words, sys.argv[2:])
        modified = True
    
    elif command == 'remove':
        if len(sys.argv) < 3:
            print("Error: Please provide at least one word to remove")
            print("Usage: python manage_words.py remove <word1> [word2] ...")
            sys.exit(1)
        words = remove_words(words, sys.argv[2:])
        modified = True
    
    elif command == 'check':
        if len(sys.argv) < 3:
            print("Error: Please provide at least one word to check")
            print("Usage: python manage_words.py check <word1> [word2] ...")
            sys.exit(1)
        check_words(words, sys.argv[2:])
        # No modification
    
    elif command == 'add-file':
        if len(sys.argv) < 3:
            print("Error: Please provide a filename")
            print("Usage: python manage_words.py add-file <filename>")
            sys.exit(1)
        words = add_from_file(words, sys.argv[2])
        modified = True
    
    elif command == 'remove-file':
        if len(sys.argv) < 3:
            print("Error: Please provide a filename")
            print("Usage: python manage_words.py remove-file <filename>")
            sys.exit(1)
        words = remove_from_file(words, sys.argv[2])
        modified = True
    
    else:
        print(f"Error: Unknown command '{command}'")
        print_usage()
        sys.exit(1)
    
    # Save if modified
    if modified:
        save_words(words)
        new_count = len(words)
        change = new_count - original_count
        if change > 0:
            print(f"\n✓ Dictionary grew by {change:,} word(s) ({original_count:,} → {new_count:,})")
        elif change < 0:
            print(f"\n✓ Dictionary shrunk by {abs(change):,} word(s) ({original_count:,} → {new_count:,})")
        else:
            print(f"\n✓ Dictionary unchanged ({new_count:,} words)")

if __name__ == '__main__':
    main()
