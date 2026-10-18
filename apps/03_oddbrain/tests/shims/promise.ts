/**
 * Test-environment shim: `Promise.withResolvers` exists in Node 22+ (what the
 * packaged app runs inside Electron). Sandboxes and older local Nodes that only
 * ship Node 20 use this standard-semantics polyfill so the same suite can run.
 * The app code itself never imports this file.
 */
if (typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    },
    writable: true,
    configurable: true,
  })
}
export {}
