import exitHook from 'exit-hook'
import { mkdtemp } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { ResolvedConfig } from 'vite'

function removeTempDirSync(config: ResolvedConfig, dir: string) {
  if (basename(dir).match(/^go-wasm-.{6}$/)) {
    try {
      rmSync(dir, {
        recursive: true,
        force: true
      })
    } catch (e) {
      config.logger.error(`fail to remove temporary directory: ${dir}`, {
        error: e as Error
      })
    }
  }
}

export async function createTempDir(config: ResolvedConfig): Promise<string> {
  try {
    const p = await mkdtemp(join(tmpdir(), "go-wasm-"))
    exitHook(() => {
      removeTempDirSync(config, p)
    })
    return p
  } catch (e) {
    config.logger.error(`fail to create temporary directory`)
    throw e
  }
}