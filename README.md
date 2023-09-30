# vite-plugin-golang-wasm

## What's this?

An opinionated `vite` plugin to load and run Go code as WASM, based on [Golang-WASM](https://github.com/teamortix/golang-wasm)'s implementation.

Compatible for:

- `vite@^4.0.0`,
- `rollup@^3.0.0`,
- Go SDK with `GO111MODULE=on` (recommended to use 1.17 or higher),
- and Node LTS (equivalent to `node18` or higher, based on [`@tsconfig/node-lts/tsconfig.json`](https://github.com/tsconfig/bases/blob/main/bases/node-lts.json)).

## Motivation

While I was looking up for a library to load Go code in my private project, I came across `Golang-WASM` project, which is exactly what I'm looking for (shoutout to [teamortix](https://github.com/teamortix) for their great work!). Unfortunately, they have only implemented a loader for `webpack` environment, and I couldn't find any alternative implementations for `vite` or `rollup` environment. Hence, why I created this plugin.

## Usage

For detailed information regarding the architecture of the bridge and bindings, please refer to [Golang-WASM#JS Interop](https://github.com/teamortix/golang-wasm#js-interop) and [Golang-WASM#How it works](https://github.com/teamortix/golang-wasm#how-it-works).

For plugin usage, simply import and register it to `vite` config just like most plugins:

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

Create a Go code, for example, a math code:

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

Then, import it from anywhere in source code:

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

#### Typescript Support

It's actually possible to generate typescript definition from Go source code since the official Go repository already offered [set of tools](https://pkg.go.dev/go) to work with Go source code such as parser, scanner, AST types, etc. However, I don't think I have the time to actually implement that, given the size and scope of the feature.

Instead, each module needs to be defined via a Typescript's declaration file. Reusing math example from above, we can create declaration file for `./math/math.go` file, like this:

```ts
// ./math/math.go.d.ts
const __default: {
  add: (x: number, y: number) => Promise<number>
}

export default __default
```

## How it works

Essentially, this plugin will transform each "imported" Go file into JS code which only contains codes for loading WASM, while the actual Go codes are bundled or inlined.

Here is an example of math code above transformed into a simple WASM loader:

```ts
import '/@id/__x00__virtual:wasm_exec'
import goWasm from '/@id/__x00__virtual:wasm_bridge'

const wasm = fetch('data:application/wasm;base64,...').then((r) =>
  r.arrayBuffer()
)
export default goWasm(wasm)
```

While the actual code are transformed into WASM and bundled (in `build` mode) or inlined (in `serve` mode).

In `build` mode, the compiled Go is emitted as asset, returning the reference ID. The reference ID will be used in URI of the fetch to load it:

```ts
const wasm = fetch(import.meta.ROLLUP_FILE_URL_{REFERENCE_ID}).then(r=>r.arrayBuffer());
```

While in `serve` mode, the code is inlined to the fetch instead:

```ts
const wasm = fetch(`data:application/wasm;base64,{BASE_64_ENCODED_CODE}`).then(
  (r) => r.arrayBuffer()
)
```

The loader depends on implementation of `Golang-WASM` both on their JS interop and Golang WASM package.

## Configuration

https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/interface.ts#L3-L11

#### goBinaryPath, wasmExecPath

By default, `goBinaryPath` and `wasmExecPath` will be resolved relative to `process.env.GOROOT` if either of these options are not defined. But an error will be thrown when `GOROOT` is also not set. `GOROOT` needs to be added into OS's environment variables or set locally before running any script, for example `GOROOT=/usr/bin/go vite dev`. Alternatively, both these options can be provided to allow direct or custom `go` binary or `wasm_exec.js` resolving.

```ts
export default defineConfig({
  plugins: [
    goWasm({
      goBinaryPath: '/path/to/go/bin/go',
      wasmExecPath: '/path/to/go/misc/wasm/wasm_exec.js',
    }),
    qwikVite({
      csr: true,
    }),
  ],
})
```

Must be noted, however, that it's not recommended to point `goBinaryPath` to other compiler with distinct CLI usage, such as `tinygo`. Read more below as to why.

#### goBuildDir, buildGoFile

`goBuildDir` will be resolved to `os.tmpdir/go-wasm-${RANDOM_STRING}`. This option defines the directory where the output and cache of the build should be placed. By default, it will create a temporary directory that persist throughout the lifecycle of `vite` process and will be cleaned up when process exits (either by `SIGINT`, normal exit, error, etc.). However, when this option is provided, it's assumed that end user will be responsible for managing the directory, from it's creation to it's cleanup.

`buildGoFile` is called when the code needs to be built. Default implementation:
https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/build.ts#L9-L46
This option can be used to set custom build directive when more control is needed.

To use compiler like `tinygo`, custom build function must be supplied instead of setting `goBinaryPath`, since `tinygo` CLI usage is incompatible with the default build implementation.

In spite of that, I'm planning to change the build API to make it easier to modify build behaviour (e.g. custom env vars, arguments, etc.).

## Dependencies

- `exit-hook` for catch-all solution to cleanup code, used to remove temporary directory:
  https://github.com/slainless/vite-plugin-golang-wasm/blob/89a18f1a1d2e2a13e236f13d1dcdc5c7baf4e5c2/src/temp_dir.ts#L26-L28

## To-Do

- [ ] Implement AST analysis for go code dependency for use in Vite HMR
- [ ] Implement `handleHotUpdate` to allow seamless HMR instead of page reload
- [ ] Add unit test

## License

**MIT**

---

Created by [slainless](https://github.com/slainless)
