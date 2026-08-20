import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { reconcileInterruptedRestore, recoveryRoot } from './backup/recovery'
import { documentsRoot } from './documents/files'
import { reconcileDocumentQuarantinesFromStore } from './documents/recovery'
import { databasePath, DatabaseStore } from './db/store'
import { registerIpc } from './ipc'

app.setName('MatterDock')

if (process.env.MATTERDOCK_USER_DATA) {
  app.setPath('userData', process.env.MATTERDOCK_USER_DATA)
}

const store = new DatabaseStore(databasePath(app.getPath('userData')))
let isQuitting = false

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#F4F2EC',
    title: 'MatterDock',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => {
    event.preventDefault()
  })
})

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  const userData = app.getPath('userData')
  const docsRoot = documentsRoot(userData)
  try {
    await reconcileInterruptedRestore({
      userData,
      dbPath: store.path(),
      documentsRoot: docsRoot
    })
  } catch (error) {
    console.error('[matterdock] restore recovery failed', error)
    await presentFatalRecovery(userData)
    return
  }
  await store.initialize()
  try {
    reconcileDocumentQuarantinesFromStore(store, docsRoot)
  } catch (error) {
    console.error('[matterdock] document quarantine recovery failed', error)
  }
  registerIpc(store, {
    documentsRoot: docsRoot,
    userData,
    appVersion: app.getVersion()
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

async function presentFatalRecovery(userData: string): Promise<void> {
  const recovery = recoveryRoot(userData)
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'MatterDock',
    message: 'MatterDock could not safely recover an interrupted restore.',
    detail: 'Your workspace has not been opened for editing. A recovery copy may still be available.',
    buttons: ['Quit', 'Show Recovery Folder'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (result.response === 1) {
    const target = existsSync(recovery) ? recovery : userData
    await shell.openPath(target)
  }
  app.quit()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void store.close().finally(() => app.quit())
})
