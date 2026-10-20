module re2js.local/fuzz/go-oracle

// The Go release whose regexp package the fuzzer compares against. CI installs exactly this
// version (setup-go reads this file); bump it deliberately, as new releases can change answers.
go 1.27.2
