// Answers questions about Go's regexp package for the re2js fuzzer (tools/fuzz/go.js): it reads
// one JSON request per line and writes one JSON response per line.
//
// Request:  {"p": pattern, "t": input as hex bytes, "longest": bool, "posix": bool, "n": limit}
// Response: {"err": bool, "all": FindAllSubmatchIndex, "numSub": NumSubexp,
//            "names": SubexpNames, "quote": QuoteMeta(input) as hex}
//
// The input travels as hex so that it can hold invalid UTF-8.
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"os"
	"regexp"
)

type request struct {
	Pattern string `json:"p"`
	Input   string `json:"t"`
	Longest bool   `json:"longest"`
	Posix   bool   `json:"posix"`
	N       int    `json:"n"`
}

type response struct {
	Err    bool     `json:"err"`
	All    [][]int  `json:"all"`
	NumSub int      `json:"numSub"`
	Names  []string `json:"names"`
	Quote  string   `json:"quote"`
}

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1<<20), 1<<26)
	out := bufio.NewWriter(os.Stdout)
	enc := json.NewEncoder(out)
	for in.Scan() {
		var req request
		if err := json.Unmarshal(in.Bytes(), &req); err != nil {
			panic(err)
		}
		input, err := hex.DecodeString(req.Input)
		if err != nil {
			panic(err)
		}

		var res response
		res.Quote = hex.EncodeToString([]byte(regexp.QuoteMeta(string(input))))
		var re *regexp.Regexp
		if req.Posix {
			re, err = regexp.CompilePOSIX(req.Pattern)
		} else {
			re, err = regexp.Compile(req.Pattern)
		}
		if err != nil {
			res.Err = true
		} else {
			if req.Longest {
				re.Longest()
			}
			n := req.N
			if n == 0 {
				n = -1
			}
			res.All = re.FindAllSubmatchIndex(input, n)
			res.NumSub = re.NumSubexp()
			res.Names = re.SubexpNames()
		}
		if err := enc.Encode(res); err != nil {
			panic(err)
		}
		out.Flush()
	}
}
