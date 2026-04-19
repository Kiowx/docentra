import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null

async function createMainWindow(): Promise<void> {
  const iconPath = app.isPackaged
    ? path.join(__dirname, '../dist/app-icon.png')
    : path.join(app.getAppPath(), 'public/app-icon.png')

  mainWindow = new BrowserWindow({
    title: '文枢 Docentra',
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#ffffff',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error']
    const label = levels[level] ?? `level-${level}`
    console.log(`[renderer:${label}] ${sourceId}:${line} ${message}`)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:did-fail-load] ${errorCode} ${errorDescription} ${validatedURL}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer:gone] reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const rootState = await mainWindow?.webContents.executeJavaScript(
        '({ title: document.title, rootChildren: document.getElementById("root")?.childElementCount ?? -1, bodyText: document.body?.innerText?.slice(0, 200) ?? "" })',
      )
      console.log(`[renderer:did-finish-load] ${JSON.stringify(rootState)}`)
    } catch (error) {
      console.error(`[renderer:inspect-failed] ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return
  }
  mainWindow.maximize()
})

ipcMain.on('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
