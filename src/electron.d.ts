export {};
declare global {
  interface Window {
    zigIDE: {
      getToolchainStatus(): Promise<{ zigPath: string | null; zlsPath: string | null; zigVersion: string | null }>;
      getZigVersions(): Promise<{ versions: string[]; installed: string[]; activePath: string | null }>;
      installZigVersion(version: string): Promise<{ version: string; path: string }>;
      installToolchains(): Promise<{ zigPath: string | null; zlsPath: string | null; zigVersion: string; zlsVersion: string }>;
      onToolchainProgress(callback: (message: string) => void): () => void;
      getZigVersion(): Promise<string>;
      getZigPath(): Promise<string>;
      chooseZigPath(): Promise<{ path: string } | null>;
      fetchPackage(args: { projectRoot: string; url: string }): Promise<{ started: boolean }>;
      openFile(): Promise<{ diskPath: string; path: string; name: string; content: string } | null>;
      getPendingOpenPath(): Promise<string | null>;
      openPath(filePath: string): Promise<{ diskPath: string; path: string; name: string; content: string }>;
      openProject(): Promise<{ root: string; files: Array<{ path: string; diskPath: string; name: string; content: string }> } | null>;
      createProject(name: string): Promise<{ root: string; files: Array<{ path: string; diskPath: string; name: string; content: string }> } | null>;
      createFolder(args: { root: string; relativePath: string }): Promise<{ path: string; diskPath: string }>;
      deleteProjectPath(args: { root: string; relativePath: string }): Promise<{ deleted: boolean }>;
      createFile(args: { root: string; relativePath: string; content: string }): Promise<{ path: string; diskPath: string; name: string; content: string }>;
      exitApp(): Promise<void>;
      saveFile(args: { filePath?: string; content: string }): Promise<{ diskPath: string; name: string; path: string } | null>;
      runFile(filePath: string): Promise<{ started: boolean }>;
      buildFile(filePath: string, outputRoot?: string): Promise<{ started: boolean }>;
      testFile(filePath: string): Promise<{ started: boolean }>;
      stopProcess(): Promise<boolean>;
      startTerminal(cwd?: string, id?: string): Promise<{ started: boolean; id: string }>;
      writeTerminal(input: string, id?: string): Promise<boolean>;
      stopTerminal(id?: string): Promise<boolean>;
      onTerminalData(callback: (payload: { id: string; data: string }) => void): () => void;
      startZls(rootPath: string): Promise<{ started: boolean; path: string }>;
      getZlsSemanticLegend(): Promise<{ tokenTypes: string[]; tokenModifiers: string[] } | null>;
      getZlsPath(): Promise<string>;
      chooseZlsPath(): Promise<{ path: string } | null>;
      requestLsp(method: string, params: unknown): Promise<any>;
      notifyLsp(method: string, params: unknown): Promise<boolean>;
      openLspDocument(filePath: string, text: string): Promise<boolean>;
      changeLspDocument(filePath: string, text: string, version: number): Promise<boolean>;
      stopZls(): Promise<boolean>;
      reportLspError(message: string): Promise<boolean>;
      onLspMessage(callback: (message: { type?: number; message: string }) => void): () => void;
      onLspDiagnostics(callback: (params: any) => void): () => void;
      onLspStatus(callback: (status: any) => void): () => void;
      openExternal(url: string): Promise<void>;
      onOutput(callback: (line: string) => void): () => void;
      onOpenPath(callback: (filePath: string) => void): () => void;
      onExit(callback: (info: { code: number | null; signal: string | null }) => void): () => void;
    };
  }
}
