import type { PluginOption, ResolvedConfig } from 'vite'
import { basename, extname, join } from 'node:path'

import { WASM_BRIDGE_ID, WASM_EXEC_ID, readFile } from './dependency.js'
import { readFile as r } from 'node:fs/promises'
import { createTempDir } from './temp_dir.js'
import { buildFile } from './build.js'
import type { Config } from './interface.js'

export type { Config, GoBuilder } from './interface.js'

export default (config?: Config) => {
  const finalConfig = Object.assign({} satisfies Config, config)

  let cfg: ResolvedConfig

  if (finalConfig.wasmExecPath == null) {
    if (process.env.GOROOT == null) {
      throw new Error("GOROOT is not set and no wasm exec path provided!")
    }
    finalConfig.wasmExecPath = join(process.env.GOROOT as string, "misc", "wasm", "wasm_exec.js")
  }

  if (finalConfig.goBinaryPath == null) {
    if (process.env.GOROOT == null) {
      throw new Error("GOROOT is not set and no go binary path provided!")
    }
    finalConfig.goBinaryPath = join(process.env.GOROOT as string, "bin", "go")
  }

  return {
    name: "golang-wasm" as const,
    configResolved(c: any) {
      cfg = c
    },
    async resolveId(source) {
      if (source == WASM_EXEC_ID) {
        return `\0${WASM_EXEC_ID}`
      }

      if (source == WASM_BRIDGE_ID) {
        return `\0${WASM_BRIDGE_ID}`
      }
    },
    async options() {
      if (finalConfig.goBuildDir == null) {
        finalConfig.goBuildDir = await createTempDir(cfg)
      }
    },
    async load(id) {
      if (id == `\0${WASM_EXEC_ID}`) {
        return {
          code: await readFile(cfg, finalConfig.wasmExecPath as string),
          moduleSideEffects: "no-treeshake"
        }
      }

      if (id == `\0${WASM_BRIDGE_ID}`) {
        const base = import.meta.url != null ? new URL('artifact/bridge.js', import.meta.url) : join(__filename, "artifact/bridge.js")
        return {
          code: await readFile(cfg, base),
          moduleSideEffects: "no-treeshake"
        }
      }

      // skip if not loading go
      if (extname(id) != ".go") {
        return
      }

      return `
        import '${WASM_EXEC_ID}';
        import goWasm from '${WASM_BRIDGE_ID}';
        
        const wasm = fetch(import.meta.ROLLUP_FILE_URL_).then(r => r.arrayBuffer());
        export default goWasm(wasm);
      `
    },
    async transform(code, id) {
      // skip if not loading go
      if (extname(id) != ".go") {
        return
      }

      const builder = finalConfig.buildGoFile != null ? finalConfig.buildGoFile : buildFile
      try {
        const wasmPath = await builder(cfg, finalConfig, id)
        let replacement: string

        if (cfg.command == "build") {
          const refId = this.emitFile({
            type: "asset",
            name: basename(id, ".go") + ".wasm",
            source: await r(wasmPath)
          })
          replacement = `fetch(import.meta.ROLLUP_FILE_URL_${refId})`
        } else {
          replacement = `fetch("data:application/wasm;base64,${await readFile(cfg, wasmPath, "base64")}")`
        }

        return code.replace(/fetch\(import\.meta\.ROLLUP_FILE_URL_[^\)]*\)/, replacement)
      } catch (e) {
        cfg.logger.error(`fail to build wasm for: ${id}`, {
          error: e as Error
        })
      }

      return
    },
  } satisfies PluginOption
}