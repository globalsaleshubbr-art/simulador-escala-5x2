// Escala 5x2 — programa de computador (Electron).
// Os dados ficam em Documentos/Escala 5x2/dados.json (com cópia de segurança automática).
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const dataDir = () => path.join(app.getPath("documents"), "Escala 5x2");
const dataFile = () => path.join(dataDir(), "dados.json");
let win = null;
app.commandLine.appendSwitch("lang", "pt-BR"); // horários em 24h e textos do sistema em português

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

ipcMain.handle("escala:load", async () => {
  try {
    return fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), "utf8") : null;
  } catch (e) {
    // arquivo corrompido: tenta a cópia de segurança
    const bak = path.join(dataDir(), "dados.backup.json");
    return fs.existsSync(bak) ? fs.readFileSync(bak, "utf8") : null;
  }
});

ipcMain.handle("escala:save", async (_e, json) => {
  try {
    JSON.parse(json);
    fs.mkdirSync(dataDir(), { recursive: true });
    if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), path.join(dataDir(), "dados.backup.json"));
    const tmp = dataFile() + ".tmp";
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, dataFile());
    return { ok: true, path: dataFile() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle("escala:saveFile", async (_e, name, bytes) => {
  const ext = path.extname(name).slice(1).toLowerCase();
  const r = await dialog.showSaveDialog(win, {
    title: "Salvar arquivo",
    defaultPath: path.join(app.getPath("documents"), name),
    filters: [{ name: ext === "pdf" ? "PDF" : ext === "xlsx" ? "Planilha do Excel" : ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return "declined";
  try {
    fs.writeFileSync(r.filePath, Buffer.from(bytes));
    shell.showItemInFolder(r.filePath);
    return "saved";
  } catch {
    return "error";
  }
});

ipcMain.handle("escala:dataPath", async () => dataFile());

function buildMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        { label: "Abrir pasta dos dados", click: () => { fs.mkdirSync(dataDir(), { recursive: true }); shell.openPath(dataDir()); } },
        {
          label: "Salvar cópia dos dados…",
          click: async () => {
            if (!fs.existsSync(dataFile())) return;
            const stamp = new Date().toISOString().slice(0, 10);
            const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("documents"), `escala5x2-dados-${stamp}.json`), filters: [{ name: "Dados", extensions: ["json"] }] });
            if (!r.canceled && r.filePath) fs.copyFileSync(dataFile(), r.filePath);
          },
        },
        {
          label: "Restaurar dados de uma cópia…",
          click: async () => {
            const r = await dialog.showOpenDialog(win, { filters: [{ name: "Dados", extensions: ["json"] }], properties: ["openFile"] });
            if (r.canceled || !r.filePaths[0]) return;
            const txt = fs.readFileSync(r.filePaths[0], "utf8");
            try {
              JSON.parse(txt);
            } catch {
              dialog.showErrorBox("Arquivo inválido", "O arquivo escolhido não é uma cópia de dados do Escala 5x2.");
              return;
            }
            fs.mkdirSync(dataDir(), { recursive: true });
            if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), path.join(dataDir(), "dados.backup.json"));
            fs.writeFileSync(dataFile(), txt, "utf8");
            win && win.reload();
          },
        },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { type: "separator" },
        { role: "zoomIn", label: "Aumentar" },
        { role: "zoomOut", label: "Diminuir" },
        { role: "resetZoom", label: "Tamanho normal" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        {
          label: "Sobre o Escala 5x2",
          click: () =>
            dialog.showMessageBox(win, {
              type: "info",
              title: "Escala 5x2",
              message: `Escala 5x2 — Simulador inteligente de supermercados\nVersão ${app.getVersion()}`,
              detail: `Seus dados ficam em:\n${dataFile()}\n\nUma cópia de segurança (dados.backup.json) é feita a cada gravação.`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Escala 5x2",
    backgroundColor: "#0f1f3d",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  // links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
