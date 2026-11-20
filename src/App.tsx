import { useState, useCallback, useEffect, useRef } from 'react';
import TitleBar, { type EditorActions } from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Terminal from './components/Terminal';
import StatusBar from './components/StatusBar';
import SetupWizard from './components/SetupWizard';
import { FileItem } from './types';

const starterCode = `const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello from Zig!\\n", .{});\n}\n`;
const defaultFiles: FileItem[] = [{ id: '1', name: 'main.zig', path: 'src/main.zig', content: starterCode, language: 'zig' }];

function App() {
  const [files, setFiles] = useState<FileItem[]>(defaultFiles);
  const [activeFileId, setActiveFileId] = useState<string>('1');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>(['1']);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [projectRoot, setProjectRoot] = useState<string | undefined>();
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [editorActions, setEditorActions] = useState<EditorActions>({ undo: () => {}, redo: () => {}, cut: () => {}, copy: () => {}, paste: () => {}, find: () => {}, replace: () => {}, selectAll: () => {}, toggleComment: () => {}, toggleWordWrap: () => {}, toggleMinimap: () => {} });
  const [projectName, setProjectName] = useState('No project');
  const [textDialog, setTextDialog] = useState<{ title: string; label: string; placeholder: string; value: string } | null>(null);
  const textDialogResolver = useRef<((value: string | null) => void) | null>(null);
  const askText = useCallback((title: string, label: string, initialValue: string, placeholder = ''): Promise<string | null> => new Promise(resolve => {
    textDialogResolver.current = resolve;
    setTextDialog({ title, label, placeholder, value: initialValue });
  }), []);
  const closeTextDialog = useCallback((value: string | null) => {
    const resolve = textDialogResolver.current;
    textDialogResolver.current = null;
    setTextDialog(null);
    resolve?.(value);
  }, []);
  const activeFile = files.find(f => f.id === activeFileId);

  useEffect(() => {
    let alive = true;
    void window.zigIDE.getToolchainStatus().then(status => { if (alive && (!status.zigPath || !status.zlsPath)) setShowSetupWizard(true); }).catch(() => { if (alive) setShowSetupWizard(true); });
    return () => { alive = false; };
  }, []);

  const appendOutput = useCallback((line: string) => setTerminalOutput(prev => [...prev, line]), []);
  useEffect(() => {
    const offOutput = window.zigIDE.onOutput(appendOutput);
    const offLspStatus = window.zigIDE.onLspStatus(status => appendOutput(status.running ? `ZLS connected: ${status.path}` : 'ZLS stopped.'));
    const offLspMessage = window.zigIDE.onLspMessage(message => appendOutput(`ZLS: ${message.message}`));
    const offDiagnostics = window.zigIDE.onLspDiagnostics(params => {
      for (const diagnostic of params.diagnostics || []) {
        const line = diagnostic.range?.start?.line + 1 || 1;
        appendOutput(`${diagnostic.severity === 1 ? 'error' : 'warning'}: ${params.uri}(${line}): ${diagnostic.message}`);
      }
    });
    void window.zigIDE.getPendingOpenPath().then(async pending => {
      if (!pending) return;
      try { const file = await window.zigIDE.openPath(pending); const id = `${Date.now()}`; const item: FileItem = { id, name: file.name, path: file.path, diskPath: file.diskPath, content: file.content, language: 'zig' }; setFiles(prev => [...prev.filter(f => f.diskPath !== file.diskPath), item]); setActiveFileId(id); setOpenTabs([id]); setProjectRoot(undefined); setProjectName(file.name); }
      catch (error) { appendOutput(`Could not open file: ${String(error)}`); }
    });
    const offOpen = window.zigIDE.onOpenPath(async (filePath) => {
      try {
        const file = await window.zigIDE.openPath(filePath);
        const id = `${Date.now()}-${Math.random()}`;
        const item: FileItem = { id, name: file.name, path: file.path, diskPath: file.diskPath, content: file.content, language: 'zig' };
        setFiles(prev => [...prev.filter(f => f.diskPath !== file.diskPath), item]);
        setActiveFileId(id); setOpenTabs(prev => [...prev, id]);
        setProjectRoot(undefined); setProjectName(file.name);
      } catch (error) { appendOutput(`Could not open file: ${String(error)}`); }
    });
    return () => { offOutput(); offOpen(); offLspStatus(); offLspMessage(); offDiagnostics(); };
  }, [appendOutput]);

  const handleFileSelect = useCallback((fileId: string) => {
    setActiveFileId(fileId);
    setOpenTabs(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
  }, []);
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: value } : f));
    setModifiedFiles(prev => new Set(prev).add(activeFileId));
  }, [activeFileId]);

  const saveFile = useCallback(async (file = activeFile): Promise<FileItem | undefined> => {
    if (!file) return undefined;
    try {
      const projectSavePath = !file.diskPath && projectRoot ? `${projectRoot.replace(/[\\/]+$/, '')}/${file.path.replace(/^[/\\]+/, '')}` : file.diskPath;
      const saved = await window.zigIDE.saveFile({ filePath: projectSavePath, content: file.content });
      if (!saved) return undefined;
      const updated = { ...file, diskPath: saved.diskPath, path: projectRoot ? saved.diskPath.slice(projectRoot.length + 1).replace(/\\/g, '/') : saved.path, name: saved.name };
      setFiles(prev => prev.map(f => f.id === file.id ? updated : f));
      setModifiedFiles(prev => { const next = new Set(prev); next.delete(file.id); return next; });
      appendOutput(`Saved: ${saved.diskPath}`);
      return updated;
    } catch (error) { appendOutput(`Save error: ${String(error)}`); return undefined; }
  }, [activeFile, appendOutput, projectRoot]);
  const handleSave = useCallback(() => { void saveFile(); }, [saveFile]);
  const handleSaveAs = useCallback(async () => {
    if (!activeFile) return;
    try {
      const saved = await window.zigIDE.saveFile({ content: activeFile.content });
      if (!saved) return;
      const updated = { ...activeFile, diskPath: saved.diskPath, path: projectRoot ? saved.diskPath.slice(projectRoot.length + 1).replace(/\\/g, '/') : saved.name, name: saved.name };
      setFiles(prev => prev.map(file => file.id === activeFile.id ? updated : file));
      setModifiedFiles(prev => { const next = new Set(prev); next.delete(activeFile.id); return next; });
      appendOutput(`Saved as: ${saved.diskPath}`);
    } catch (error) { appendOutput(`Save As error: ${String(error)}`); }
  }, [activeFile, appendOutput, projectRoot]);

  const handleRun = useCallback(async () => {
    if (!activeFile || activeFile.language !== 'zig') return;
    setIsTerminalVisible(true);
    const saved = await saveFile(activeFile);
    if (!saved?.diskPath) { appendOutput('Save the file before running it.'); return; }
    try { appendOutput(`> zig run ${saved.path}`); await window.zigIDE.runFile(saved.diskPath); }
    catch (error) { appendOutput(`Run error: ${String(error)}`); }
  }, [activeFile, appendOutput, saveFile]);
  const handleBuild = useCallback(async () => {
    if (!activeFile || activeFile.language !== 'zig') return;
    setIsTerminalVisible(true);
    const saved = await saveFile(activeFile);
    if (!saved?.diskPath) { appendOutput('Save the file before building it.'); return; }
    try { appendOutput('> zig build-exe (ReleaseFast)'); await window.zigIDE.buildFile(saved.diskPath, projectRoot); appendOutput(`The executable will be written to zig-out/bin.`); }
    catch (error) { appendOutput(`Build error: ${String(error)}`); }
  }, [activeFile, appendOutput, saveFile]);
  const handleRunTest = useCallback(async () => {
    if (!activeFile?.diskPath && !activeFile) return;
    setIsTerminalVisible(true);
    const saved = await saveFile(activeFile);
    if (!saved?.diskPath) { appendOutput('Save the file before running tests.'); return; }
    try { appendOutput(`> zig test ${saved.path}`); await window.zigIDE.testFile(saved.diskPath); }
    catch (error) { appendOutput(`Test error: ${String(error)}`); }
  }, [activeFile, appendOutput, saveFile]);
  const handleStop = useCallback(async () => { const stopped = await window.zigIDE.stopProcess(); if (stopped) appendOutput('Stop requested.'); }, [appendOutput]);
  const handleTerminalCommand = useCallback(async (command: string, terminalId: string) => {
    try {
      await window.zigIDE.startTerminal(projectRoot, terminalId);
      await window.zigIDE.writeTerminal(`${command}\n`, terminalId);
    } catch (error) { appendOutput(`Terminal error: ${String(error)}`); }
  }, [appendOutput, projectRoot]);

  const loadProject = useCallback((result: Awaited<ReturnType<typeof window.zigIDE.openProject>>) => {
    if (!result) return;
    const loaded: FileItem[] = result.files.map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, path: file.path, diskPath: file.diskPath, content: file.content, language: file.name.endsWith('.zig') ? 'zig' : file.name.endsWith('.md') ? 'markdown' : 'json' }));
    setFiles(loaded); setProjectRoot(result.root); setProjectName(result.root.split(/[\\/]/).pop() || 'Zig project');
    const first = loaded.find(f => f.name === 'main.zig') || loaded.find(f => f.language === 'zig') || loaded[0];
    setActiveFileId(first?.id || ''); setOpenTabs(first ? [first.id] : []); setModifiedFiles(new Set());
    appendOutput(`Project opened: ${result.root}`);
  }, [appendOutput]);
  const handleOpenProject = useCallback(async () => { try { loadProject(await window.zigIDE.openProject()); } catch (error) { appendOutput(`Open project error: ${String(error)}`); } }, [appendOutput, loadProject]);
  const handleConfigureZig = useCallback(async () => {
    try {
      const selected = await window.zigIDE.chooseZigPath();
      if (selected) {
        const version = await window.zigIDE.getZigVersion();
        appendOutput(`Zig configured: ${selected.path} (version ${version})`);
      }
    } catch (error) { appendOutput(`Could not configure Zig: ${String(error)}`); }
  }, [appendOutput]);

  const handleConfigureZls = useCallback(async () => {
    try {
      const selected = await window.zigIDE.chooseZlsPath();
      if (selected) {
        const root = projectRoot || (activeFile?.diskPath ? activeFile.diskPath.replace(/[\\/][^\\/]+$/, '') : undefined);
        if (root) { await window.zigIDE.stopZls(); await window.zigIDE.startZls(root); if (activeFile?.diskPath) await window.zigIDE.openLspDocument(activeFile.diskPath, activeFile.content); }
        appendOutput(`ZLS configured: ${selected.path}`);
      }
    } catch (error) { appendOutput(`Could not configure ZLS: ${String(error)}`); }
  }, [activeFile, appendOutput, projectRoot]);

  const handlePackageManager = useCallback(async () => {
    if (!projectRoot) { appendOutput('Open a project containing build.zig.zon first.'); setIsTerminalVisible(true); return; }
    const url = await askText('Zig Package Manager', 'HTTPS URL of a Git repository or Zig package archive', 'https://', 'https://...');
    if (!url?.trim()) return;
    setIsTerminalVisible(true);
    appendOutput(`> zig fetch --save ${url}`);
    try {
      await window.zigIDE.fetchPackage({ projectRoot, url });
      appendOutput('Zig fetched the dependency. Check build.zig.zon, then add the module to build.zig.');
    } catch (error) { appendOutput(`Package manager error: ${String(error)}`); }
  }, [projectRoot, appendOutput, askText]);

  const handleNewProject = useCallback(async () => {
    const name = await askText('New Zig Project', 'Project name', 'my-zig-project');
    if (!name?.trim()) return;
    try { const result = await window.zigIDE.createProject(name); loadProject(result); if (result) appendOutput('New Zig project created. Press F5 to run.'); }
    catch (error) { appendOutput(`Project creation error: ${String(error)}`); }
  }, [appendOutput, loadProject, askText]);
  const handleOpenFile = useCallback(async () => {
    try {
      const file = await window.zigIDE.openFile(); if (!file) return;
      const id = `${Date.now()}`;
      const item: FileItem = { id, name: file.name, path: file.path, diskPath: file.diskPath, content: file.content, language: file.name.endsWith('.zig') ? 'zig' : 'plaintext' };
      setFiles(prev => [...prev.filter(f => f.diskPath !== item.diskPath), item]); setActiveFileId(id); setOpenTabs(prev => [...prev, id]);
    } catch (error) { appendOutput(`Open file error: ${String(error)}`); }
  }, [appendOutput]);
  const handleNewFolder = useCallback(async (directory = '') => {
    try {
      let root = projectRoot;
      if (!root) { const selected = await window.zigIDE.openProject(); if (!selected) return; loadProject(selected); root = selected.root; }
      const suggested = [directory, 'new-folder'].filter(Boolean).join('/');
      const name = await askText('New Folder', 'Folder name', suggested, suggested);
      if (!name?.trim()) return;
      const created = await window.zigIDE.createFolder({ root, relativePath: name.trim() });
      const markerPath = `${created.path}/.gitkeep`;
      const marker: FileItem = { id: `folder-${Date.now()}`, name: '.gitkeep', path: markerPath, diskPath: `${created.diskPath}\\.gitkeep`, content: '', language: 'plaintext' };
      setFiles(prev => [...prev.filter(file => file.path !== markerPath), marker]);
      appendOutput(`Folder created: ${created.diskPath}`);
    } catch (error) { appendOutput(`Create folder error: ${String(error)}`); setIsTerminalVisible(true); }
  }, [projectRoot, appendOutput, loadProject, askText]);

  const handleNewFile = useCallback(async (directory = '') => {
    try {
      let root = projectRoot;
      if (!root) { const selected = await window.zigIDE.openProject(); if (!selected) return; loadProject(selected); root = selected.root; }
      const suggested = [directory, 'new-file.zig'].filter(Boolean).join('/');
      const relativePath = await askText('New File', 'File name', suggested, suggested);
      if (!relativePath?.trim()) return;
      const created = await window.zigIDE.createFile({ root, relativePath: relativePath.trim(), content: starterCode });
      const id = `${Date.now()}`;
      const file: FileItem = { id, name: created.name, path: created.path, diskPath: created.diskPath, content: created.content, language: created.name.endsWith('.zig') ? 'zig' : 'plaintext' };
      setFiles(prev => [...prev.filter(item => item.diskPath !== created.diskPath), file]);
      setActiveFileId(id); setOpenTabs(prev => [...prev, id]); setModifiedFiles(prev => { const next = new Set(prev); next.delete(id); return next; });
      appendOutput(`File created: ${created.diskPath}`);
    } catch (error) { appendOutput(`Create file error: ${String(error)}`); setIsTerminalVisible(true); }
  }, [projectRoot, loadProject, appendOutput, askText]);

  const handleDeletePath = useCallback(async (relativePath: string, isFolder: boolean) => {
    if (!projectRoot || !relativePath) return;
    const targetName = relativePath.split('/').pop() || relativePath;
    const confirmed = window.confirm(isFolder ? `Delete folder "${targetName}" and all its contents? This cannot be undone.` : `Delete file "${targetName}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await window.zigIDE.deleteProjectPath({ root: projectRoot, relativePath });
      const normalized = relativePath.replace(/\\/g, '/').replace(/\/$/, '');
      const removed = files.filter(file => file.path === normalized || file.path.startsWith(`${normalized}/`));
      const removedIds = new Set(removed.map(file => file.id));
      setFiles(prev => prev.filter(file => !removedIds.has(file.id)));
      setOpenTabs(prev => prev.filter(id => !removedIds.has(id)));
      setModifiedFiles(prev => { const next = new Set(prev); removedIds.forEach(id => next.delete(id)); return next; });
      if (removedIds.has(activeFileId)) { const remaining = files.find(file => !removedIds.has(file.id)); setActiveFileId(remaining?.id || ''); }
      appendOutput(`Deleted ${isFolder ? 'folder' : 'file'}: ${relativePath}`);
    } catch (error) { appendOutput(`Delete error: ${String(error)}`); }
  }, [projectRoot, files, activeFileId, appendOutput]);

  const handleCloseTab = useCallback((fileId: string) => {
    setOpenTabs(prev => { const tabs = prev.filter(id => id !== fileId); if (activeFileId === fileId) setActiveFileId(tabs[tabs.length - 1] || ''); return tabs; });
  }, [activeFileId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F5') { event.preventDefault(); void handleRun(); }
      else if (event.key === 'F6') { event.preventDefault(); void handleBuild(); }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 't') { event.preventDefault(); void handleRunTest(); }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); void handleSaveAs(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); handleSave(); }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); void handleNewFolder(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); handleNewFile(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); void handleOpenFile(); }
      else if (event.key === 'Escape') { /* keep editor focus behavior */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun, handleBuild, handleSave, handleSaveAs, handleRunTest, handleNewFile, handleNewFolder, handleOpenFile]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#1a1a2e' }}>
      <TitleBar onSave={handleSave} onSaveAs={handleSaveAs} onRun={handleRun} onBuild={handleBuild} onOpenFile={handleOpenFile} onOpenProject={handleOpenProject} onStop={handleStop} onRunTest={handleRunTest} onNewFile={handleNewFile} onNewFolder={handleNewFolder} onNewProject={handleNewProject} onToggleTerminal={() => setIsTerminalVisible(v => !v)} onToggleSidebar={() => setIsSidebarVisible(v => !v)} onPackageManager={handlePackageManager} onConfigureZig={handleConfigureZig} onConfigureZls={handleConfigureZls} onSetupTools={() => setShowSetupWizard(true)} onExit={() => { void window.zigIDE.exitApp(); }} editorActions={editorActions} hasChanges={modifiedFiles.size > 0} projectName={projectName} />
      <div className="flex flex-1 overflow-hidden">
        {isSidebarVisible && <Sidebar files={files} activeFileId={activeFileId} onFileSelect={handleFileSelect} onCreateFile={handleNewFile} onCreateFolder={handleNewFolder} onDeletePath={handleDeletePath} width={250} projectName={projectName} />}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center justify-between bg-[#16162a] px-4 h-8 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-[11px] text-gray-400 truncate">{projectName}</span>
            <span className="text-[10px] text-gray-600">Zig 0.17.1</span>
          </div>
          <div className="flex bg-[#16162a] overflow-x-auto shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {openTabs.map(tabId => { const file = files.find(f => f.id === tabId); if (!file) return null; const isActive = tabId === activeFileId; const isModified = modifiedFiles.has(tabId); return (
              <div key={tabId} className={`tab-enter flex items-center gap-2 px-4 py-2 cursor-pointer min-w-fit group transition-colors duration-150 ${isActive ? 'text-gray-200' : 'text-gray-500 hover:text-gray-400'}`} style={{ background: isActive ? '#1a1a2e' : 'transparent', borderRight: '1px solid rgba(255,255,255,0.04)', borderTop: isActive ? '2px solid rgba(139,92,246,0.6)' : '2px solid transparent' }} onClick={() => setActiveFileId(tabId)}>
                <span className="text-amber-500/70"><i className="fas fa-file-code text-[10px]"></i></span><span className="text-[12px]">{file.name}</span>{isModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-500/80"></span>}
                <button className="ml-1.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-white/10" onClick={e => { e.stopPropagation(); handleCloseTab(tabId); }}><i className="fas fa-times text-[9px]"></i></button>
              </div>); })}
          </div>
          <div className="flex-1 overflow-hidden min-h-0">{activeFile ? <Editor value={activeFile.content} language={activeFile.language} onChange={handleEditorChange} filePath={activeFile.diskPath} workspaceRoot={projectRoot} onActionsReady={setEditorActions} /> : <div className="h-full flex items-center justify-center text-gray-500 text-sm">Open a project or create one via File → New Project</div>}</div>
          {isTerminalVisible && <Terminal output={terminalOutput} onCommand={handleTerminalCommand} height={terminalHeight} onResize={setTerminalHeight} cwd={projectRoot} onClearOutput={() => setTerminalOutput([])} />}
        </div>
      </div>
      <StatusBar activeFile={activeFile} hasChanges={modifiedFiles.size > 0} />
      {textDialog && <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 px-4" onMouseDown={event => { if (event.target === event.currentTarget) closeTextDialog(null); }}>
        <form className="w-full max-w-md rounded-xl border border-white/10 p-5 shadow-2xl" style={{ background: '#222238' }} onSubmit={event => { event.preventDefault(); closeTextDialog(textDialog.value); }}>
          <h2 className="text-base font-semibold text-gray-100 mb-4">{textDialog.title}</h2>
          <label className="block text-xs text-gray-400 mb-2">{textDialog.label}</label>
          <input autoFocus value={textDialog.value} placeholder={textDialog.placeholder} onChange={event => setTextDialog(current => current ? { ...current, value: event.target.value } : current)} onKeyDown={event => { if (event.key === 'Escape') closeTextDialog(null); }} className="w-full rounded-md border border-white/10 bg-[#151525] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-400" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => closeTextDialog(null)} className="rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
            <button type="submit" className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500">Continue</button>
          </div>
        </form>
      </div>}
      {showSetupWizard && <SetupWizard onClose={() => setShowSetupWizard(false)} onInstalled={() => { appendOutput('Zig and ZLS are installed and configured.'); }} />}
    </div>
  );
}
export default App;
