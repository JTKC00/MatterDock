import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { AppError, USER_ERRORS } from '@shared/errors'
import { translate, type SupportedLocale } from '@shared/i18n'
import { reconcileInterruptedRestore, recoveryRoot } from './backup/recovery'
import { documentsRoot } from './documents/files'
import { reconcileDocumentQuarantinesFromStore } from './documents/recovery'
import { databasePath, DatabaseStore } from './db/store'
import { registerIpc } from './ipc'
import { readPreferences, writePreferences } from './prefs'
import { applicationResourcePaths, assertApplicationResources, type ApplicationResourcePaths } from './resources'

const APPLICATION_ID = 'com.snugzap.matterdock'

app.setName('MatterDock')
if (process.platform === 'win32') app.setAppUserModelId(APPLICATION_ID)

if (process.env.MATTERDOCK_USER_DATA) {
  app.setPath('userData', process.env.MATTERDOCK_USER_DATA)
}

const store = new DatabaseStore(databasePath(app.getPath('userData')))
const resources: ApplicationResourcePaths = applicationResourcePaths(__dirname, process.resourcesPath)
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
      preload: resources.preload,
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
    void window.loadFile(resources.renderer)
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
  let currentLocale: SupportedLocale = readPreferences(userData, app.getLocale()).locale
  try {
    assertApplicationResources(resources, { requireSqlWasm: app.isPackaged })
    await store.initialize({
      packaged: app.isPackaged,
      sqlWasmPath: app.isPackaged ? resources.sqlWasm : undefined
    })
  } catch (error) {
    console.error('[matterdock] application startup failed', error)
    await presentFatalStartup(currentLocale, error)
    return
  }
  try {
    await reconcileInterruptedRestore({
      userData,
      dbPath: store.path(),
      documentsRoot: docsRoot
    })
  } catch (error) {
    console.error('[matterdock] restore recovery failed', error)
    await presentFatalRecovery(userData, currentLocale)
    return
  }
  try {
    reconcileDocumentQuarantinesFromStore(store, docsRoot)
  } catch (error) {
    console.error('[matterdock] document quarantine recovery failed', error)
  }
  registerIpc(store, {
    documentsRoot: docsRoot,
    userData,
    appVersion: app.getVersion(),
    getLocale: () => currentLocale,
    setLocale: (locale) => {
      currentLocale = locale
      try {
        writePreferences(userData, { locale })
      } catch (error) {
        console.error('[matterdock] language preference could not be saved', error)
        throw new AppError(USER_ERRORS.persistFailed, 'LOCALE_PERSIST', { cause: error })
      }
    }
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

async function presentFatalStartup(locale: SupportedLocale, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error)
  await dialog.showMessageBox({
    type: 'error',
    title: translate(locale, 'native.startupTitle'),
    message: translate(locale, 'native.startupMessage'),
    detail: translate(locale, 'native.startupDetail', { detail }),
    buttons: [translate(locale, 'native.fatalQuit')],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  app.quit()
}

async function presentFatalRecovery(userData: string, locale: SupportedLocale): Promise<void> {
  const recovery = recoveryRoot(userData)
  const result = await dialog.showMessageBox({
    type: 'error',
    title: translate(locale, 'native.fatalTitle'),
    message: translate(locale, 'native.fatalMessage'),
    detail: translate(locale, 'native.fatalDetail'),
    buttons: [translate(locale, 'native.fatalQuit'), translate(locale, 'native.fatalShow')],
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
