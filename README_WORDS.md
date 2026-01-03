# Word Dictionary Manager

A simple Python script to manage your `words.txt` file - add, remove, or check words quickly.

## Quick Start

```bash
# Check dictionary stats
python manage_words.py stats

# Remove swear words from profanity.txt
python manage_words.py remove-file profanity.txt

# Add a single word
python manage_words.py add hello

# Remove multiple words
python manage_words.py remove badword1 badword2 badword3

# Check if words exist
python manage_words.py check test example
```

## Usage

```
python manage_words.py <command> [arguments]
```

### Commands

**`add <word1> [word2] ...`**
- Add one or more words to the dictionary
- Example: `python manage_words.py add pizza taco burrito`

**`remove <word1> [word2] ...`**
- Remove one or more words from the dictionary
- Example: `python manage_words.py remove badword1 badword2`

**`check <word1> [word2] ...`**
- Check if words exist in the dictionary (doesn't modify)
- Example: `python manage_words.py check hello world`

**`add-file <filename>`**
- Add all words from a file (one word per line)
- Example: `python manage_words.py add-file new_words.txt`

**`remove-file <filename>`**
- Remove all words from a file (one word per line)
- Example: `python manage_words.py remove-file profanity.txt`

**`stats`**
- Show dictionary statistics (word count, length distribution, etc.)
- Example: `python manage_words.py stats`

## Removing Profanity

1. Edit `profanity.txt` and add offensive words (one per line)
2. Run: `python manage_words.py remove-file profanity.txt`
3. Done! The words are removed from `words.txt`

## Features

✓ **Fast** - Handles 400k+ words in seconds
✓ **Safe** - Shows what will be added/removed before saving
✓ **Smart** - Automatically removes duplicates and sorts alphabetically
✓ **Case-insensitive** - Converts everything to lowercase
✓ **Detailed feedback** - Shows exactly what changed

## Important Notes

⚠️ **The script overwrites `words.txt`!** Make a backup first:
```bash
cp words.txt words.txt.backup
```

- All words are converted to lowercase
- Words are saved in alphabetical order
- Duplicates are automatically removed
- Empty lines and whitespace are ignored

## Examples

### Remove all profanity
```bash
# Create profanity.txt with bad words (one per line)
echo "badword1" > profanity.txt
echo "badword2" >> profanity.txt

# Remove them all
python manage_words.py remove-file profanity.txt
```

### Add custom words
```bash
# Add game-specific terms
python manage_words.py add ezra nitya matt addie

# Or from a file
python manage_words.py add-file custom_words.txt
```

### Check what's in there
```bash
# See if specific words exist
python manage_words.py check pizza test hello

# View statistics
python manage_words.py stats
```

## File Structure

```
your-repo/
├── words.txt           # Your main dictionary file (400k+ words)
├── manage_words.py     # This script
├── profanity.txt       # List of words to remove (optional)
└── README_WORDS.md     # This file
```

## Troubleshooting

**"Error: words.txt not found!"**
- Make sure you're running the script from the same directory as `words.txt`
- Or specify the full path: `python manage_words.py add myword`

**Words still appearing after removal**
- The script is case-insensitive and removes all variants
- Check if the word is spelled exactly as it appears
- Use `check` command to verify: `python manage_words.py check badword`

**Script is slow**
- For 400k words, it might take 5-10 seconds to load/save
- This is normal! Python is reading and sorting hundreds of thousands of lines

## Contributing

Found a bug? Have a suggestion? Open an issue or PR!
