/**
 * A tiny shim so the existing tests run unchanged.
 *
 * They were written against node:test. Moving the runner to Vitest (so the tests
 * can import TypeScript directly) would otherwise mean editing every test file,
 * which is how test suites quietly lose coverage during a port. Aliasing the
 * import instead keeps every assertion exactly as it was written.
 *
 * Only the surface those tests actually use is implemented — test(), the
 * modifiers, the BDD helpers, and the one mock they reach for
 * (t.mock.method, used to stand in for fetch).
 */
import {
  test as vitestTest,
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'

type Body = (context: TestContext) => unknown | Promise<unknown>

/** t.mock for the one test that stubs fetch, with the same "put it back afterwards". */
export type TestContext = {
  mock: {
    method: (
      target: Record<string, unknown>,
      key: string,
      impl?: (...args: any[]) => any
    ) => (...args: any[]) => any
    fn: (impl?: (...args: any[]) => any) => (...args: any[]) => any
  }
  /** Set when the test wants to skip itself part-way through. */
  skip: () => void
  [key: string]: unknown
}

function createMock(onRestore: (undo: () => void) => void) {
  const undo: Array<() => void> = []
  return {
    method(
      target: Record<string, unknown>,
      key: string,
      impl?: (...args: any[]) => any
    ): (...args: any[]) => any {
      const original = target[key] as ((...args: any[]) => any) | undefined
      const calls: unknown[][] = []
      const spy = (...args: unknown[]) => {
        calls.push(args)
        return impl ? impl.apply(target, args) : original?.apply(target, args)
      }
      spy.mock = { calls, callCount: () => calls.length }
      target[key] = spy
      undo.push(() => {
        target[key] = original
      })
      return spy
    },
    fn(impl: (...args: any[]) => any = () => undefined) {
      const calls: unknown[][] = []
      const spy = (...args: unknown[]) => {
        calls.push(args)
        return impl(...args)
      }
      spy.mock = { calls, callCount: () => calls.length }
      return spy
    },
    /** Called by the wrapper once the test is over. */
    restore: () => {
      for (const step of undo.reverse()) step()
      onRestore(() => {})
    },
  }
}

type TestFn = {
  (name: string, body: Body): void
  skip: (name: string, body?: Body) => void
  todo: (name: string) => void
  before: (body: () => unknown) => void
  after: (body: () => unknown) => void
}

const test = ((name: string, body: Body) => {
  vitestTest(name, context => {
    const mock = createMock(() => {})
    const hooks: Array<() => unknown> = []
    const ctx: TestContext = {
      ...(context as unknown as Record<string, unknown>),
      mock,
      skip: () => context.skip(),
      after: (fn: () => unknown) => hooks.push(fn),
    }
    const finish = () => {
      for (const fn of hooks.reverse()) fn()
      mock.restore()
    }
    const result = body(ctx)
    // Both paths have to restore: a failing test that stubbed fetch would
    // otherwise leak the stub into the next one.
    return Promise.resolve(result).then(
      value => {
        finish()
        return value
      },
      error => {
        finish()
        throw error
      }
    )
  })
}) as TestFn

test.skip = (name: string, body?: Body) => {
  vitestTest.skip(name, (body ?? (() => {})) as never)
}

test.todo = (name: string) => {
  vitestTest.todo(name)
}

test.before = (body: () => unknown) => {
  beforeAll(body)
}

test.after = (body: () => unknown) => {
  afterAll(body)
}

export { test, describe, it, beforeAll, afterAll, beforeEach, afterEach }
export default test
