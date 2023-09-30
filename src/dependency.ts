import { readFile as read } from 'node:fs/promises'
import { ResolvedConfig } from 'vite'
import { PathLike } from 'node:fs'

export const WASM_EXEC_ID = "virtual:wasm_exec"
export const WASM_BRIDGE_ID = "virtual:wasm_bridge"

export async function readFile(config: ResolvedConfig, path: PathLike, encoding: BufferEncoding = "utf-8"): Promise<string> {
  try {
    return await read(path, {
      encoding
    })
  } catch (e) {
    config.logger.error(`fail to read ${path}`)
    throw e
  }
}