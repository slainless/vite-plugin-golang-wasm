/* 
MIT LICENSE

Copyright (c) 2023 Ahmad Fauzy
Copyright (c) 2021 Hamza Ali and Chan Wen Xu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. 
*/

import raf from 'raf'
raf.polyfill()

// Initially, the __go_wasm__ object will be an empty object.
const g =
  typeof global != 'undefined'
    ? global
    : typeof window != 'undefined'
    ? window
    : typeof self != 'undefined'
    ? self
    : undefined
if (!g.__go_wasm__) {
  g.__go_wasm__ = {}
}

/**
 * The maximum amount of time that we would expect Wasm to take to initialize.
 * If it doesn't initialize after this time, we send a warning to console.
 * Most likely something has gone wrong if it takes more than 3 seconds to initialize.
 */
const maxTime = 3 * 1000

/**
 * bridge is an easier way to refer to the Go WASM object.
 */
const bridge = g.__go_wasm__

/**
 * Wrapper is used by Go to run all Go functions in JS.
 *
 * @param {Function} goFunc a function that is expected to return an object of the following specification:
 * {
 *  result:  undefined | any         // undefined when error is returned, or function returns undefined.
 *  error:       Error | undefined   // undefined when no error is present.
 * }
 *
 * @returns {Function} returns a function that take arguments which are used to call the Go function.
 */
function wrapper(goFunc) {
  return (...args) => {
    const result = goFunc.apply(undefined, args)
    if (result.error instanceof Error) {
      throw result.error
    }
    return result.result
  }
}

/**
 * Sleep is used when awaiting for Go Wasm to initialize.
 * It uses the lowest possible sane delay time (via requestAnimationFrame).
 * However, if the window is not focused, requestAnimationFrame never returns.
 * A timeout will ensure to be called after 50 ms, regardless of whether or not the tab is in focus.
 *
 * @returns {Promise} an always-resolving promise when a tick has been completed.
 */
function sleep() {
  return new Promise((res) => {
    requestAnimationFrame(() => res())
    setTimeout(() => {
      res()
    }, 50)
  })
}

/**
 * @param {ArrayBuffer} getBytes a promise that is bytes of the Go Wasm object.
 *
 * @returns {Proxy} an object that can be used to call WASM's objects and properly parse their results.
 *
 * All values that want to be retrieved from the proxy, regardless of if they are a function or not, must be retrieved
 * as if they are from a function call.
 *
 * If a non-function value is returned however arguments are provided, a warning will be printed.
 */
export default function (getBytes) {
  let proxy
  let go

  async function init() {
    bridge.__wrapper__ = wrapper

    go = new g.Go()
    let bytes = await getBytes
    let result = await WebAssembly.instantiate(bytes, go.importObject)
    go.run(result.instance)
  }

  init()
  setTimeout(() => {
    if (bridge.__ready__ !== true) {
      console.warn(
        'Golang WASM Bridge (__go_wasm__.__ready__) still not true after max time'
      )
    }
  }, maxTime)

  proxy = new Proxy(
    {},
    {
      get: (_, key) => {
        return (...args) => {
          return new Promise(async (res, rej) => {
            if (!go || go.exited) {
              return rej(new Error('The Go instance is not active.'))
            }
            while (bridge.__ready__ !== true) {
              await sleep()
            }

            if (typeof bridge[key] !== 'function') {
              res(bridge[key])

              if (args.length !== 0) {
                console.warn(
                  'Retrieved value from WASM returned function type, however called with arguments.'
                )
              }
              return
            }

            try {
              res(bridge[key].apply(undefined, args))
            } catch (e) {
              rej(e)
            }
          })
        }
      },
    }
  )

  bridge.__proxy__ = proxy
  return proxy
}
