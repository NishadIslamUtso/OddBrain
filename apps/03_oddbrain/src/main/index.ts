import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorkspaceStore } from './store'
import { createVaultReader, saveVaultFolder } from './vault'
import type { Workspace } from '../shared/workspace'
import type { VaultReply } from '../shared/desktop'

const isSmoke = process.argv.includes('--smoke')
const rendererFile = resolve(__dirname, '../renderer/index.html')
const devUrl = process.env['ELECTRON_RENDERER_URL']
app.setName('OddBrain')

const trustedFrame = (url: string): boolean => {
  try {
    if (devUrl && new URL(url).origin === new URL(devUrl).origin) return true
    return new URL(url).protocol === 'file:' && resolve(fileURLToPath(url)) === rendererFile
  } catch {
    return false
  }
}
const message = (cause: unknown): string => (cause instanceof Error ? cause.message : 'The request failed.')

async function setupServices(): Promise<void> {
  const dataDirectory = app.getPath('userData')
  const store = createWorkspaceStore(dataDirectory)
  const vaultPreference = join(dataDirectory, 'vault-folder.txt')
  let folder = ''
  if (existsSync(vaultPreference)) {
    try {
      folder = (await readFile(vaultPreference, 'utf8')).trim()
    } catch {
      /* The vault pane reports a missing selection. */
    }
  }
  const vault = createVaultReader(() => folder)
  const handle = (name: string, callback: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(name, (event, ...args: unknown[]) => {
      if (event.senderFrame !== event.sender.mainFrame || !trustedFrame(event.senderFrame?.url || ''))
        throw new Error('This window is not allowed to use the desktop bridge.')
      return callback(...args)
    })
  }
  handle('workspace:read', () => store.read())
  handle('workspace:write', (data, revision) => store.write(data as Workspace, revision as number))
  handle('vault:list', () => vault.list())
  handle('vault:read', (path) => vault.read(typeof path === 'string' ? path : ''))
  handle('vault:choose', async (): Promise<VaultReply> => {
    const answer = await dialog.showOpenDialog({
      title: 'Choose your notes folder',
      properties: ['openDirectory'],
    })
    if (answer.canceled || !answer.filePaths[0])
      return { ok: false, canceled: true, error: 'Folder choice canceled.' }
    try {
      await saveVaultFolder(vaultPreference, answer.filePaths[0])
      folder = answer.filePaths[0]
      return vault.list()
    } catch (failure) {
      return { ok: false, error: message(failure) }
    }
  })
  handle('app:about', () => ({ version: app.getVersion(), platform: process.platform }))
}

async function launch(): Promise<void> {
  const window = new BrowserWindow({
    title: 'OddBrain',
    width: 1280,
    height: 820,
    minWidth: 740,
    minHeight: 520,
    show: false,
    backgroundColor: '#f4f2ec',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedFrame(url)) event.preventDefault()
  })
  const counts = { errors: 0, warnings: 0 }
  if (isSmoke)
    window.webContents.on('console-message', (_event, level) => {
      if (level === 3) counts.errors++
      if (level === 2) counts.warnings++
    })
  window.once('ready-to-show', () => window.show())
  if (devUrl) await window.loadURL(devUrl)
  else await window.loadFile(rendererFile)
  if (isSmoke) void smoke(window, counts)
}

/** A native smoke still demands painted pixels, a moving scroller and no console noise. */
async function smoke(window: BrowserWindow, counts: { errors: number; warnings: number }): Promise<void> {
  try {
    window.show()
    const ready = (await window.webContents.executeJavaScript(
      `new Promise(resolve => {
      const deadline = setTimeout(() => resolve(false), 10000)
      const check = () => {
        if (!document.querySelector('[data-app-ready]')) return requestAnimationFrame(check)
        clearTimeout(deadline)
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
      }
      check()
    })`,
      true,
    )) as boolean
    const scroll = (await window.webContents.executeJavaScript(
      `(() => {
      const target = document.querySelector('[data-find-scroll]')
      if (!target) return false
      const spacer = document.createElement('div'); spacer.style.height = '3000px'; spacer.style.flexShrink = '0'; target.appendChild(spacer)
      target.scrollTop = 1000
      const moved = target.scrollTop > 100
      spacer.remove(); target.scrollTop = 0
      return moved
    })()`,
      true,
    )) as boolean
    let capture = await window.webContents.capturePage()
    const deadline = Date.now() + 5000
    while (capture.isEmpty() && Date.now() < deadline) {
      await window.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(resolve))',
        true,
      )
      capture = await window.webContents.capturePage()
    }
    const blank = capture.isEmpty()
    const failed = !ready || !scroll || blank || counts.errors > 0 || counts.warnings > 0
    console.log(
      `SMOKE ${blank ? 'BLANK' : 'OK'} SCROLL ${scroll ? 'OK' : 'BROKEN'} ready=${ready} errors=${counts.errors} warnings=${counts.warnings}`,
    )
    app.exit(failed ? 1 : 0)
  } catch (failure) {
    console.error(`SMOKE FAILED: ${message(failure)}`)
    app.exit(1)
  }
}

app
  .whenReady()
  .then(async () => {
    await setupServices()
    await launch()
  })
  .catch((error) => {
    console.error(message(error))
    app.exit(1)
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0)
    void launch().catch((error) => console.error(message(error)))
})
