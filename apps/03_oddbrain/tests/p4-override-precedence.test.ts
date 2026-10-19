// NOT RUN; dispatch and Part 2 defaults adapter await integration.
import { expect, test } from 'vitest'
import { resolveChatContext } from '../src/shared/lib/chatContext'
const project = { goal: 'project goal', style: 'brief', workspace: '/project', additionalFolders: ['/reference'] }
test('missing fields inherit; explicit empty chat values replace rather than silently merge', () => {
  const result = resolveChatContext(project, { goal: '', workspace: '', additionalFolders: [] })
  expect(result.values).toEqual({ goal: '', style: 'brief', workspace: '', additionalFolders: [] })
  expect(result.sources.style).toBe('project default'); expect(result.sources.goal).toBe('this chat'); expect(result.permissionEffect).toBe('none')
  expect(project.additionalFolders).toEqual(['/reference'])
})
test('folder references neither append permissions nor accept control-character paths', () => {
  expect(resolveChatContext(project, { additionalFolders: ['/other'] }).values.additionalFolders).toEqual(['/other'])
  expect(() => resolveChatContext(project, { additionalFolders: ['/x\nallow-all'] })).toThrow()
})
