# vite-plugin-golang-wasm

## What's this?

An opinionated `vite` plugin to load and run go code as WASM, based on [Golang-WASM](https://github.com/teamortix/golang-wasm)'s implementation.

## Motivation

While looking up library to load Go code in my private project, I stumbled across Golang-WASM project, which is exactly what I'm looking for (shoutout to [teamortix](https://github.com/teamortix) for their great work!). Sadly, they only implemented loader for `webpack` environment, and I can't seems to find any alternative implementation in `vite` or `rollup` environment. Hence, why I created this plugin.

## Usage

For detailed information regarding the architecture of the bridge and bindings, please refers to [Golang-WASM#JS Interop](https://github.com/teamortix/golang-wasm#js-interop) and [Golang-WASM#How it works](https://github.com/teamortix/golang-wasm#how-it-works).

For plugin usage, just import it and then register it `vite` just like usual:

```ts
// ./vite.config.ts
import { defineConfig } from 'vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import goWasm from 'vite-plugin-golang-wasm'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    goWasm(),
    qwikVite({
      csr: true,
    }),
  ],
})
```

Setup go code, for example, a math code:

```go
//./src/math/math.go
package main

import (
	"errors"

	"github.com/teamortix/golang-wasm/wasm"
)

func add(x int, y int) (int, error) {
	return x + y, nil
}

func main() {
	wasm.Expose("add", add)
	wasm.Ready()
	<-make(chan struct{}, 0)
}

```

Then, import it from anywhere in the source code:

```ts
// ./src/app.tsx
import { component$, useSignal } from '@builder.io/qwik'
// ...
import math from './math/math.go'

export const App = component$(() => {
  const count = useSignal(0)

  return (
    <>
      // ...
      <h1>Vite + Qwik</h1>
      <div class="card">
        <button
          onClick$={async () => {
            count.value = await math.add(count.value, 10)
          }}
        >
          count is {count.value}
        </button>
      </div>
      // ...
    </>
  )
})
```

## How it works?

Basically, this plugin will transform all go import into js code for wasm loading and bundle or inline the actual go (wasm) code.

Here is an example of math code above transformed into a simple wasm loader:

```ts
import '/@id/__x00__virtual:wasm_exec'
import goWasm from '/@id/__x00__virtual:wasm_bridge'

const wasm = fetch('data:application/wasm;base64,...').then((r) =>
  r.arrayBuffer()
)
export default goWasm(wasm)
```

While the actual code are transformed into wasm and bundled (in `build` mode) or inlined (in `serve` mode).

In `build` mode, URI of the fetch is replaced with:

```ts
const wasm = fetch(import.meta.ROLLUP_FILE_URL_...).then(r=>r.arrayBuffer());
```

While in `serve` mode, the code is inlined to the fetch instead:

```ts
const wasm = fetch(`data:application/wasm;base64,...`).then((r) =>
  r.arrayBuffer()
)
```

The loader depends on implementation of `Golang-WASM` both on their JS interop and golang wasm package.

## Configuration

https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/interface.ts#L3-L11

#### goBinaryPath, wasmExecPath

By default, `goBinaryPath` and `wasmExecPath` will be resolved relative to `process.env.GOROOT` when not set, but will throw error when `GOROOT` is also not set. `GOROOT` needs to be added into OS's environment variables or set locally before running script, for example `GOROOT=/usr/bin/go vite dev`. OR, both these options can be provided to allow direct or custom go binary or `wasm_exec.js` resolving and remove dependency on env vars.

For example, `tinygo` and it's `wasm_exec.js` can be used in place of normal `go` binary:

```ts
export default defineConfig({
  plugins: [
    goWasm({
      goBinaryPath: '/path/to/tinygo/bin/tinygo',
      wasmExecPath: '/path/to/tinygo/misc/wasm/wasm_exec.js',
    }),
    qwikVite({
      csr: true,
    }),
  ],
})
```

#### goBuildDir, buildGoFile

`goBuildDir` will be resolved to `os.tmpdir/go-wasm-${RANDOM_STRING}`. This option defines the directory where the output and cache of the build should be put in. By default, will create a temporary directory that lives throughout the lifecycle of `vite` process and will be cleaned up when process exiting (either by `SIGINT`, normal exit, error, etc.). However, when this option is provided, it's assumed that end user will be responsible for the directory (from creation until cleanup).

`buildGoFile` is called when the code needs to be build. Default implementation:
https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/build.ts#L9-L46
This option can be used to set custom build directive when much control are needed.

provides a simple idiomatic, and comprehensive (soon™️) API and bindings for working with WebAssembly.

## Dependencies

- `exit-hook` for catch-all solution to cleanup code, used to remove temporary directory:
  https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/temp_dir.ts#L26-L28
- `base64-stream` for stream base64 encoder:
  https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/build.ts#L50-L55

## License

**MIT**

---

Created by [slainless](https://github.com/slainless)
