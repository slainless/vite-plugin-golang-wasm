# vite-plugin-golang-wasm

## What's this?

An opinionated `vite` plugin to load and run Go code as WASM, based on [Golang-WASM](https://github.com/teamortix/golang-wasm)'s implementation.

Compatible for:

- [ESM-only environment](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)
- `vite: ^4.0.0 || ^5.0.0`,
- `rollup: ^3.0.0`,
- Go with `GO111MODULE=on` (recommended to use 1.17 or higher),
- and Node LTS (equivalent to `node18` or higher, based on [`@tsconfig/node-lts/tsconfig.json`](https://github.com/tsconfig/bases/blob/main/bases/node-lts.json)).

## Motivation

While I was looking up for a library to load Go code in my private project, I came across `Golang-WASM` project, which is exactly what I'm looking for (shoutout to [teamortix](https://github.com/teamortix) for their great work!). Unfortunately, they have only implemented a loader for `webpack` environment, and I couldn't find any alternative implementations for `vite` or `rollup` environment. Hence, why I created this plugin.

## Bridge implementation difference

Aside from difference of tooling usage, this package also differs in it's bridge implementation (albeit, preserving majority of the implementation):

- Proper global context handling. Original implementation will almost guaranteed to throw when `global` is not defined.
- Proxied only function calls.
- Moved readiness check from function call into initiation.

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

> ⚠️ ATTENTION: Entrypoint's package must be `main` or it will fail to load. See [go/wiki/WebAssembly](https://github.com/golang/go/wiki/WebAssembly#:~:text=Note%20that%20you%20can%20only%20compile%20main%20packages.%20Otherwise%2C%20you%20will%20get%20an%20object%20file%20that%20cannot%20be%20run%20in%20WebAssembly.%20If%20you%20have%20a%20package%20that%20you%20want%20to%20be%20able%20to%20use%20with%20WebAssembly%2C%20convert%20it%20to%20a%20main%20package%20and%20build%20a%20binary.), https://github.com/golang/go/issues/35657#issuecomment-554904779.

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

Essentially, this plugin will transform each "imported" Go file into JS code which only contains codes for loading WASM. By default, the code will be bundled (as asset) or inlined (as base64 data) and then loaded via fetch call:

```ts
import '/@id/__x00__virtual:wasm_exec'
import goWasm from '/@id/__x00__virtual:wasm_bridge'

const wasm = fetch(`${ data }`).then((r) =>
  r.arrayBuffer()
)
export default goWasm(wasm)
```

In default setup, the actual code are transformed into WASM and will be emitted as asset (in `build` mode) or inlined (in `serve` mode). The resulting asset or resulting inlined code (in base64 format) can then be imported or loaded via `fetch` call

Loaded as an asset (default setup, `build`):

```ts
const wasm = fetch(import.meta.ROLLUP_FILE_URL_{REFERENCE_ID}).then(r=>r.arrayBuffer());
```

Loaded as base64 data (default setup, `serve`):

```ts
const wasm = fetch(`data:application/wasm;base64,{BASE_64_ENCODED_CODE}`).then(
  (r) => r.arrayBuffer()
)
```

You can change the output of the Go-loading JS code using plugin's option: `transform`. For example, you can modify the transformation process to always emit the Go code:

```ts
...
import { WASM_EXEC_ID, WASM_BRIDGE_ID } from 'vite-plugin-golang-wasm'

export default defineConfig({
  plugins: [
    goWasm({
      async transform(command, emit, read) {
        return `
          import '${WASM_EXEC_ID}';
          import goWasm from '${WASM_BRIDGE_ID}';
          
          const wasm = fetch(import.meta.ROLLUP_FILE_URL_${await emit()}).then(r => r.arrayBuffer());
          export default await goWasm(wasm);
        `
      }
    }),
    ...
  ],
})
```

## Configuration

https://github.com/slainless/vite-plugin-golang-wasm/blob/8afe0a48ac9dc1bb4b4b043576231c86ceacc1fa/src/interface.ts#L3-L11

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

Must be noted, however, that it's not recommended to point `goBinaryPath` to other compiler with very distinct CLI usage. Specifically, the compiler must accept or support this CLI execution:

```ts
`${binary} build ${optional_extra_args} -o ${output_path} ${input_path}`
```

For example, you can use `tinygo` compiler instead, by pointing `goBinaryPath` to `tinygo` path. Other extra argument such as `--target` can be added via `goBuildExtraArgs`.

#### goBuildDir, buildGoFile

`goBuildDir` will be resolved to `os.tmpdir/go-wasm-${RANDOM_STRING}`. This option defines the directory where the output and cache of the build should be placed. By default, it will create a temporary directory that persist throughout the lifecycle of `vite` process and will be cleaned up when process exits (either by `SIGINT`, normal exit, error, etc.). However, when this option is provided, it's assumed that end user will be responsible for managing the directory, from it's creation to it's cleanup.

`buildGoFile` is called when the code needs to be built. Default implementation:

https://github.com/slainless/vite-plugin-golang-wasm/blob/f48063ef18a79ec364244c87404cbf50c224ce16/src/build.ts#L5-L42

This option can be used to set custom build directive when more control is needed.

#### goBuildExtraArgs

`goBuildExtraArgs` allows you to add extra arguments and/or flags to the build call. For example, if your go codebase is in a subdirectory and you need to indicate to the compiler where is the go.mod file, you can provide extra `-C` flag to the build call:

```ts
export default defineConfig({
  plugins: [
    goWasm({
      goBuildExtraArgs: ["-C", "./path/to/go.mod/directory"]
    }),
    qwikVite({
      csr: true,
    }),
  ],
})
```

#### transform

`transform` allows you to modify the transformation process of this plugin. This option expecting signature:

```ts
(command: "build" | "serve", emit: () => Promise<string>, read: () => Promise<Buffer>) => Promise<string | undefined>
```

- `command`: Taken directly from Vite runtime. Can be `command` or `serve`.
- `emit`: Returns asset ID of the emitted go code. To make use of this ID, you have to prepend it with `import.meta.ROLLUP_FILE_URL_`. Then, you can load it via `fetch` or import it via `import` (need more tweaking to make the path acceptable).

```ts
fetch("import.meta.ROLLUP_FILE_URL_" + await emit())
```

- `read`: Returns the contents of the file in `Buffer`. You can use `read` to load the file directly and inlined it into the resulting js file, for example: 

```ts
fetch("data:application/wasm;base64," + Buffer.from(await read()).toString("base64"))
```

For example, in Cloudflare Worker environment, you can actually import wasm code directly via import syntax. So, you can give custom `transform` directive to load the wasm as asset instead of inlining it, and using import instead of fetch:

```ts
  return `
    import '${WASM_EXEC_ID}';
    import goWasm from '${WASM_BRIDGE_ID}';
    
    const wasm = await import("./" + "import.meta.ROLLUP_FILE_URL_" + await emit());
    export default await goWasm(wasm);
  `
```

Aside from transforming how the code loading, you can also use `transform` to provide or load your own bridge implementation or even exec implementation. Just don't import `WASM_EXEC_ID` or `WASM_BRIDGE_ID` and you can eject into your own implementation. 

## Dependencies

- `exit-hook` for catch-all solution to cleanup code, used to remove temporary directory:
  https://github.com/slainless/vite-plugin-golang-wasm/blob/8afe0a48ac9dc1bb4b4b043576231c86ceacc1fa/src/temp_dir.ts#L26-L28

## To-Do

- [ ] Implement AST analysis for go code dependency for use in Vite HMR
- [ ] Implement `handleHotUpdate` to allow seamless HMR instead of page reload
- [ ] Add unit test

## License

**MIT**

---

Created by [slainless](https://github.com/slainless)
