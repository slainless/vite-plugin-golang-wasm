import { ResolvedConfig } from 'vite'

export interface Config {
  wasmExecPath?: string
  goBinaryPath?: string
  goBuildDir?: string

  buildGoFile?: GoBuilder
}

export type GoBuilder = (config: ResolvedConfig, pluginConfig: Config, id: string) => string | Promise<string>