import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
test('Node 24 is the project, type and CI toolchain; Electron remains independently versioned', () => {
  const root = resolve(process.cwd(), '../..')
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  expect(pkg.engines.node).toBe('>=24 <25')
  expect(lock.packages[''].engines.node).toBe(pkg.engines.node)
  expect(pkg.devDependencies['@types/node']).toMatch(/^24\./)
  expect(readFileSync(resolve(root, '.nvmrc'), 'utf8').trim()).toBe('24')
  for (const file of ['checks.yml', 'installer.yml']) {
    const yaml = readFileSync(resolve(root, '.github/workflows', file), 'utf8')
    expect(yaml.match(/node-version: 24/g)?.length).toBeGreaterThan(0)
    expect(yaml).not.toMatch(/node-version: 22/)
    expect(yaml).toContain('actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444')
    expect(yaml).toContain('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f')
  }
  expect(pkg.devDependencies.electron).toMatch(/^41\./)
})
