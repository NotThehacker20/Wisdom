/* Tutor SMR para escritorio (Electron): abre la misma web en una ventana propia. */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { start } = require("./server");

// Puerto fijo: así la dirección no cambia y el progreso guardado se conserva entre aperturas.
const PORT = 47615;
const URL = `http://127.0.0.1:${PORT}/`;
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(async () => {
    try {
      await start(PORT);
    } catch (err) {
      dialog.showErrorBox("Tutor SMR", `No se pudo iniciar la app (el puerto ${PORT} está ocupado por otro programa).\n\n${err.message}`);
      app.quit();
      return;
    }
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1280, height: 860, minWidth: 380, minHeight: 560,
      title: "Tutor SMR", backgroundColor: "#f4f6fb", autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // Los enlaces externos (consola de Anthropic, etc.) se abren en el navegador normal.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(URL)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
    });
    win.loadURL(URL);
    win.on("closed", () => { win = null; });
  });

  app.on("window-all-closed", () => app.quit());
}
