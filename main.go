package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"slices"
	"strings"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}

	var err error
	switch os.Args[1] {
	case "gen-words":
		err = generateWords()
	case "serve":
		err = serve()
	default:
		usage()
	}

	if err != nil {
		log.Fatalf("error: %v\n", err)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: main <serve|gen-plates>")
	os.Exit(2)
}

func serve() error {
	l, err := net.Listen("tcp", ":9999")
	if err != nil {
		return fmt.Errorf("creating listener: %w", err)
	}

	return http.Serve(l, http.FileServer(http.FS(os.DirFS("public"))))
}

func generateWords() error {
	wordsFile, err := os.ReadFile("public/words.txt")
	if err != nil {
		return fmt.Errorf("reading words file: %w", err)
	}

	type difficulty struct {
		Matches    int `json:"matches"`
		Percentile int `json:"percentile"`
	}

	words := strings.Split(string(wordsFile), "\n")
	combinations := make(map[string]difficulty, 26*26*26)
	counts := make([]int, 0, 26*26*26)

	for i := range 26 {
		a := rune('a' + i)
		for j := range 26 {
			b := rune('a' + j)
			for k := range 26 {
				c := rune('a' + k)

				matches := 0
				for _, w := range words {
					if matchWord([]rune{a, b, c}, w) {
						matches++
					}
				}

				if matches > 20 {
					combinations[fmt.Sprintf("%c%c%c", a, b, c)] = difficulty{
						Matches: matches,
					}
					counts = append(counts, matches)
				}
			}
		}
	}

	slices.Sort(counts)
	l := float64(len(counts))
	for combo, diff := range combinations {
		idx, _ := slices.BinarySearch(counts, diff.Matches)
		combinations[combo] = difficulty{
			Matches:    diff.Matches,
			Percentile: int(math.Floor((l - float64(idx)) / l * 100)),
		}
	}

	out, err := json.Marshal(combinations)
	if err != nil {
		return fmt.Errorf("marshaling results: %w", err)
	}

	return os.WriteFile("public/plate_difficulty.json", out, 0o644)
}

func matchWord(chars []rune, word string) bool {
	i := 0
	for _, c := range word {
		if i == len(chars) {
			break
		}
		if c == chars[i] {
			i++
			continue
		}

		if slices.Contains(chars[i+1:], c) {
			return false
		}
	}

	return i == len(chars)
}
