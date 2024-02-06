import { execFile } from 'node:child_process'
import { extname, join, relative } from 'node:path'
import { GoBuilder } from './interface.js'

export const buildFile: GoBuilder = (viteConfig, config, id): Promise<string> => {
  const outputPath = join(config.goBuildDir as string, relative(process.cwd(), id.replace(extname(id), "") + ".wasm"))
  const result = execFile(config.goBinaryPath as string, ["build", ...config.goBuildExtraArgs || [], "-o", outputPath, id], {
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
        return reject(new Error(`builder exit with code: ${code}`))
      }
      resolve(outputPath)
    })

    result.once("error", (err) => {
      reject(err)
    })
  })
}
