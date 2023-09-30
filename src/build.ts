import { Base64Encode } from 'base64-stream'
import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { Writable } from 'node:stream'
import { ResolvedConfig } from 'vite'
import { GoBuilder } from './interface.js'

export const buildFile: GoBuilder = (viteConfig, config, id): Promise<string> => {
  const outputPath = join(config.goBuildDir as string, relative(process.cwd(), id.replace(extname(id), "") + ".wasm"))
  const result = execFile(config.goBinaryPath as string, ["build", "-o", outputPath, "-target", "wasm", id], {
    cwd: process.cwd(),
    env: {
      GOPATH: process.env.GOPATH,
      GOROOT: process.env.GOROOT,
      GOCACHE: join(config.goBuildDir as string, ".gocache"),
      GOOS: "js",
      GOARCH: "wasm"
    }
  }, (err, stdout, stderr) => {
    if (err != null) {
      throw err
    }

    if (stdout != "") {
      viteConfig.logger.info(stdout)
    }

    if (stderr != "") {
      viteConfig.logger.error(stderr)
    }
  })

  return new Promise((resolve, reject) => {
    result.once("exit", (code, _) => {
      if (code !== 0) {
        reject(new Error(`builder exit with code: ${code}`))
      }
      resolve(outputPath)
    })

    result.once("error", (err) => {
      reject(err)
    })
  })
}

export function base64EncodeFile(_: ResolvedConfig, filePath: string): Promise<string> {
  let sink = ""
  const stream = createReadStream(filePath).pipe(new Base64Encode()).pipe(new Writable({
    write(chunk, _, callback) {
      sink += chunk.toString()
      callback()
    },
  }))

  return new Promise((resolve, reject) => {
    stream.on("error", (e) => {
      reject(e)
    })

    stream.on("finish", () => {
      resolve(sink)
    })
  })
}