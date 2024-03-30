import type { PluginOption, ResolvedConfig } from 'vite'
import type { SourceDescription, TransformPluginContext } from 'rollup'
import { basename, extname, join } from 'node:path'

import { WASM_BRIDGE_ID, WASM_EXEC_ID, readFile } from './dependency.js'
import { readFile as r } from 'node:fs/promises'
import { createTempDir } from './temp_dir.js'
import { buildFile } from './build.js'
import type { Config } from './interface.js'

export type { Config, GoBuilder } from './interface.js'

export { WASM_BRIDGE_ID, WASM_EXEC_ID } from './dependency.js'

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
    async resolveId(this: any, source): Promise<string | undefined> {
      if (source == WASM_EXEC_ID) {
        return `\0${WASM_EXEC_ID}`
      }

      if (source == WASM_BRIDGE_ID) {
        return `\0${WASM_BRIDGE_ID}`
      }
    },
    async options(this: any) {
      if (finalConfig.goBuildDir == null) {
        finalConfig.goBuildDir = await createTempDir(cfg)
      }
    },
    async load(this: any, id): Promise<string | Pick<SourceDescription, "code" | "moduleSideEffects"> | undefined> {
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

      // intentionally left empty
      return ``
    },
    async transform(this: any, code, id): Promise<string | undefined> {
      // skip if not loading go
      if (extname(id) != ".go") {
        return
      }

      const builder = finalConfig.buildGoFile != null ? finalConfig.buildGoFile : buildFile
      try {
        const wasmPath = await builder(cfg, finalConfig, id)
        const emit = async () => (this.emitFile as TransformPluginContext['emitFile'])({
          type: "asset",
          name: basename(id, ".go") + ".wasm",
          source: await r(wasmPath)
        })
        const read = async () => readFile(cfg, wasmPath, undefined) as unknown as Buffer

        if(config?.transform != null) {
          return config.transform(cfg.command, emit, read)
        }

        const content = cfg.command == 'build' ? 
          `import.meta.ROLLUP_FILE_URL_` + await emit() :
          `data:application/wasm;base64,` + Buffer.from(await read()).toString("base64")

        return `
          import '${WASM_EXEC_ID}';
          import goWasm from '${WASM_BRIDGE_ID}';
          
          const wasm = fetch(${content}).then(r => r.arrayBuffer());
          export default await goWasm(wasm);
        `
      } catch (e) {
        cfg.logger.error(`fail to build wasm for: ${id}`, {
          error: e as Error
        })
      }

      return
    },
  } satisfies PluginOption
}