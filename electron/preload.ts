import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getToolchainStatus: () => ipcRenderer.invoke('toolchain:status'),
  getZigVersions: () => ipcRenderer.invoke('zig:versions'),
  installZigVersion: (version: string) => ipcRenderer.invoke('zig:install-version', version),
  installToolchains: () => ipcRenderer.invoke('toolchain:install'),
  onToolchainProgress: (callback: (message: string) => void) => { const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message); ipcRenderer.on('toolchain:progress', listener); return () => ipcRenderer.removeListener('toolchain:progress', listener); },
  getZigVersion: () => ipcRenderer.invoke('zig:version'),
  getZigPath: (): Promise<string> => ipcRenderer.invoke('zig:get-path'),
  chooseZigPath: () => ipcRenderer.invoke('zig:choose-path'),
  fetchPackage: (args: { projectRoot: string; url: string }) => ipcRenderer.invoke('zig:fetch-package', args),
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (filePath: string) => ipcRenderer.invoke('file:open-path', filePath),
  getPendingOpenPath: (): Promise<string | null> => ipcRenderer.invoke('file:get-pending-path'),
  openProject: () => ipcRenderer.invoke('project:open'),
  createProject: (name: string) => ipcRenderer.invoke('project:create', name),
  createFolder: (args: { root: string; relativePath: string }) => ipcRenderer.invoke('project:create-folder', args),
  deleteProjectPath: (args: { root: string; relativePath: string }) => ipcRenderer.invoke('project:delete-path', args),
  createFile: (args: { root: string; relativePath: string; content: string }) => ipcRenderer.invoke('project:create-file', args),
  exitApp: () => ipcRenderer.invoke('app:exit'),
  saveFile: (args: { filePath?: string; content: string }) => ipcRenderer.invoke('file:save', args),
  runFile: (filePath: string) => ipcRenderer.invoke('zig:run', filePath),
  buildFile: (filePath: string, outputRoot?: string) => ipcRenderer.invoke('zig:build', { filePath, outputRoot }),
  testFile: (filePath: string) => ipcRenderer.invoke('zig:test', filePath),
  stopProcess: () => ipcRenderer.invoke('process:stop'),
  startTerminal: (cwd?: string, id = 'terminal-1') => ipcRenderer.invoke('terminal:start', { cwd, id }),
  writeTerminal: (input: string, id = 'terminal-1') => ipcRenderer.invoke('terminal:write', { id, input }),
  stopTerminal: (id?: string) => ipcRenderer.invoke('terminal:stop', id),
  startZls: (rootPath: string) => ipcRenderer.invoke('zls:start', rootPath),
  getZlsSemanticLegend: () => ipcRenderer.invoke('zls:semantic-legend'),
  getZlsPath: (): Promise<string> => ipcRenderer.invoke('zls:get-path'),
  chooseZlsPath: () => ipcRenderer.invoke('zls:choose-path'),
  requestLsp: (method: string, params: unknown) => ipcRenderer.invoke('zls:request', { method, params }),
  notifyLsp: (method: string, params: unknown) => ipcRenderer.invoke('zls:notify', { method, params }),
  openLspDocument: (filePath: string, text: string) => ipcRenderer.invoke('zls:open-document', { filePath, text }),
  changeLspDocument: (filePath: string, text: string, version: number) => ipcRenderer.invoke('zls:change-document', { filePath, text, version }),
  stopZls: () => ipcRenderer.invoke('zls:stop'),
  reportLspError: (message: string) => ipcRenderer.invoke('zls:report-error', message),
  onLspMessage: (callback: (message: { type?: number; message: string }) => void) => { const listener = (_event: Electron.IpcRendererEvent, message: { type?: number; message: string }) => callback(message); ipcRenderer.on('lsp:message', listener); return () => ipcRenderer.removeListener('lsp:message', listener); },
  onLspDiagnostics: (callback: (params: any) => void) => { const listener = (_event: Electron.IpcRendererEvent, params: any) => callback(params); ipcRenderer.on('lsp:diagnostics', listener); return () => ipcRenderer.removeListener('lsp:diagnostics', listener); },
  onLspStatus: (callback: (status: any) => void) => { const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status); ipcRenderer.on('lsp:status', listener); return () => ipcRenderer.removeListener('lsp:status', listener); },
  onTerminalData: (callback: (payload: { id: string; data: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => callback(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  onOutput: (callback: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
    ipcRenderer.on('process:output', listener);
    return () => ipcRenderer.removeListener('process:output', listener);
  },
  onOpenPath: (callback: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('file:open-path', listener);
    return () => ipcRenderer.removeListener('file:open-path', listener);
  },
  onExit: (callback: (info: { code: number | null; signal: string | null }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { code: number | null; signal: string | null }) => callback(info);
    ipcRenderer.on('process:exit', listener);
    return () => ipcRenderer.removeListener('process:exit', listener);
  }
};
contextBridge.exposeInMainWorld('zigIDE', api);
