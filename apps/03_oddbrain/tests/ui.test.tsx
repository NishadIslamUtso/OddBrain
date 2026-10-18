// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/renderer/src/app/App'

const key = 'oddbrain-ui-first:v1'
beforeEach(() => {
  localStorage.clear()
  delete window.oddbrain
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('UI-first browser workspace', () => {
  it('saves only user notes and navigates the actual local record', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /friend/i })).toBeTruthy()
    expect(screen.getByText(/No engine connected/)).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Write a note' }), 'A useful thought')
    await user.click(screen.getByRole('button', { name: /Save note/i }))
    expect(await screen.findByText(/These are your own saved notes/)).toBeTruthy()
    expect(screen.getAllByText('A useful thought').length).toBeGreaterThan(1)
    expect(JSON.parse(localStorage.getItem(key) || '{}').data.chats[0].messages[0]).toMatchObject({
      role: 'note',
      text: 'A useful thought',
    })
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByText('Saved notes')).toBeTruthy()
    expect(screen.getAllByText('A useful thought').length).toBeGreaterThan(0)
  })

  it('creates real projects, persists appearance and marks inaccessible vault/engine paths', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /friend/i })
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await user.type(screen.getByRole('textbox', { name: 'New project name' }), 'Sandbox')
    await user.click(screen.getByRole('button', { name: 'New project' }))
    expect(await screen.findByRole('heading', { name: /Sandbox/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Vault' }))
    expect(screen.getByRole('button', { name: 'Choose folder' }).hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Brain' }))
    expect(screen.getByRole('button', { name: 'Choose a folder' }).hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    await user.click(screen.getByRole('button', { name: 'dark' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(JSON.parse(localStorage.getItem(key) || '{}').data.appearance.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Engine' }))
    expect(screen.getByText(/does not launch Claude Code/)).toBeTruthy()
  })

  it('fails closed on damaged storage without erasing the record', async () => {
    localStorage.setItem(key, 'not-json')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /workspace could not be opened/i })).toBeTruthy()
    expect(localStorage.getItem(key)).toBe('not-json')
    expect(screen.getByText(/Nothing was replaced/)).toBeTruthy()
  })
})
