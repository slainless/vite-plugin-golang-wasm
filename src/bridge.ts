const g = 
  typeof globalThis !== "undefined" ? globalThis : 
  typeof global !== "undefined" ? global : 
  typeof window !== "undefined" ? window :
  self

// @ts-expect-error
if(typeof Go == 'undefined')
  throw new Error("Golang wasm_exec should be initialized first")

// @ts-expect-error
if(typeof __go_wasm__ == "undefined") {
  // @ts-expect-error
  g.__go_wasm__ = {}
}

// Untested yet, don't know whether uninterrupted 16ms timer is actually sane in non-browser env
const raf = typeof requestAnimationFrame == 'undefined' ? (cb: () => void) => setTimeout(cb, 1000 / 60) : requestAnimationFrame

// @ts-expect-error
const bridge = __go_wasm__ as any

function wrapper(goFunc: Function) {
  return (...args: any[]) => {
    const result = goFunc.apply(undefined, args)
    if (result.error instanceof Error) {
      throw result.error
    }
    return result.result
  }
}

bridge.__wrapper__ = wrapper

export default async function (bytes: BufferSource | Promise<BufferSource>) {
  // @ts-expect-error
  const go = new Go()
  const result = await WebAssembly.instantiate(await bytes, go.importObject) 
  go.run(result.instance)

  setTimeout(() => {
    if (bridge.__ready__ !== true) {
      console.warn(
        'Golang WASM Bridge (__go_wasm__.__ready__) still not true after max time'
      )
    }
  }, 3 * 1000)

  while(bridge.__ready__ !== true) {
    await new Promise<void>((res) => {
      raf(() => res())
      setTimeout(() => {
        res()
      }, 50)
    })
  }

  return new Proxy({}, {
    get(_, key) {
      if(typeof bridge[key] === 'function')
        return (...args: any[]) => bridge[key].apply(undefined, args)
      return bridge[key]
    },
  })
}
