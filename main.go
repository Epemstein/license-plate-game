package main

import (
	"log"
	"net"
	"net/http"
	"os"
)

func main() {
	l, err := net.Listen("tcp", ":9999")
	if err != nil {
		log.Fatalf("error creating listener: %v\n", err)
	}

	_ = http.Serve(l, http.FileServer(http.FS(os.DirFS("."))))
}
