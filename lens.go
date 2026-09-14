package main

import (
	"context"
	_ "embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// Built by packages/lenses/build-wasm.sh or downloaded by scripts/fetch-lenses.sh.
//
//go:embed packages/lenses/dist/isnot_lenses.wasm
var lensesWasm []byte

type identifier struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type subject struct {
	URI         string       `json:"uri"`
	CID         string       `json:"cid"`
	Title       string       `json:"title"`
	Type        string       `json:"type"`
	Identifiers []identifier `json:"identifiers,omitempty"`
}

type resolution struct {
	Supported bool    `json:"supported"`
	Subject   subject `json:"subject"`
	Error     string  `json:"error,omitempty"`
}

type lenses struct {
	runtime wazero.Runtime
	mod     api.Module
	// ponytail: one instance behind a mutex; the wasm allocator is not thread-safe.
	// Pool instances if resolve latency ever matters.
	mu sync.Mutex
}

func loadLenses(ctx context.Context) (*lenses, error) {
	r := wazero.NewRuntime(ctx)
	mod, err := r.Instantiate(ctx, lensesWasm)
	if err != nil {
		r.Close(ctx)
		return nil, fmt.Errorf("instantiate lenses: %w", err)
	}
	return &lenses{runtime: r, mod: mod}, nil
}

func (l *lenses) Close(ctx context.Context) error { return l.runtime.Close(ctx) }

func (l *lenses) resolveSubject(ctx context.Context, uri, cid string, record map[string]any) (resolution, error) {
	input, err := json.Marshal(map[string]any{"uri": uri, "cid": cid, "record": record})
	if err != nil {
		return resolution{}, err
	}
	out, err := l.call(ctx, "resolve_subject", input)
	if err != nil {
		return resolution{}, err
	}
	var res resolution
	if err := json.Unmarshal(out, &res); err != nil {
		return resolution{}, err
	}
	if res.Error != "" {
		return res, errors.New(res.Error)
	}
	return res, nil
}

func (l *lenses) supportedCollections(ctx context.Context) ([]string, error) {
	out, err := l.call(ctx, "supported_collections", nil)
	if err != nil {
		return nil, err
	}
	var cols []string
	return cols, json.Unmarshal(out, &cols)
}

// reinstantiate replaces the module after a trapped call. The Rust crate builds with
// panic=abort, so a trap leaves the wasm heap in an undefined state and the singleton must not
// serve another call against it.
func (l *lenses) reinstantiate(ctx context.Context) {
	_ = l.mod.Close(ctx)
	if mod, err := l.runtime.Instantiate(ctx, lensesWasm); err == nil {
		l.mod = mod
	}
}

// call runs an exported function over the buffer ABI and returns a copy of its result.
func (l *lenses) call(ctx context.Context, fn string, input []byte) ([]byte, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	mem := l.mod.Memory()
	var args []uint64
	if input != nil {
		p, err := l.mod.ExportedFunction("alloc").Call(ctx, uint64(len(input)))
		if err != nil {
			l.reinstantiate(ctx)
			return nil, err
		}
		if !mem.Write(uint32(p[0]), input) {
			return nil, errors.New("lenses: input write out of range")
		}
		defer l.mod.ExportedFunction("dealloc").Call(ctx, p[0], uint64(len(input)))
		args = []uint64{p[0], uint64(len(input))}
	}
	res, err := l.mod.ExportedFunction(fn).Call(ctx, args...)
	if err != nil {
		l.reinstantiate(ctx)
		return nil, fmt.Errorf("lenses %s: %w", fn, err)
	}
	ptr := uint32(res[0])
	header, ok := mem.Read(ptr, 4)
	if !ok {
		return nil, errors.New("lenses: result header out of range")
	}
	n := binary.LittleEndian.Uint32(header)
	view, ok := mem.Read(ptr+4, n)
	if !ok {
		return nil, errors.New("lenses: result out of range")
	}
	// wazero returns a view into module memory, which dealloc may reuse; copy first.
	out := append([]byte(nil), view...)
	_, err = l.mod.ExportedFunction("dealloc").Call(ctx, uint64(ptr), uint64(4+n))
	if err != nil {
		l.reinstantiate(ctx)
		return nil, err
	}
	return out, nil
}
