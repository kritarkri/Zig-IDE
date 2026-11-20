import { useState } from 'react';
import { FileItem } from '../types';

interface SidebarProps {
  files: FileItem[];
  activeFileId: string;
  onFileSelect: (fileId: string) => void;
  onCreateFile: (directory: string) => void;
  onCreateFolder: (directory: string) => void;
  onDeletePath: (relativePath: string, isFolder: boolean) => void;
  width: number;
  projectName?: string;
}
interface TreeNode { name: string; path: string; isFolder: boolean; children: TreeNode[]; file?: FileItem }
interface MenuState { x: number; y: number; path: string; isFolder: boolean; isRoot: boolean }

export default function Sidebar({ files, activeFileId, onFileSelect, onCreateFile, onCreateFolder, onDeletePath, width, projectName = 'Zig Project' }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const fileTree = buildFileTree(files);
  const toggleFolder = (path: string) => setExpandedFolders(prev => { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next; });
  const showMenu = (event: React.MouseEvent, path: string, isFolder: boolean, isRoot = false) => {
    event.preventDefault(); event.stopPropagation();
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 150), path, isFolder, isRoot });
  };
  const closeMenu = () => setMenu(null);
  const menuDirectory = menu ? (menu.isFolder ? menu.path : menu.path.split('/').slice(0, -1).join('/')) : '';
  if (collapsed) return <div className="w-12 flex flex-col items-center py-3 gap-1 shrink-0" style={{ background: '#16162a', borderRight: '1px solid rgba(255,255,255,0.04)' }}><button onClick={() => setCollapsed(false)} className="p-2.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]"><i className="fas fa-chevron-right text-[10px]"></i></button></div>;
  return <div className="flex flex-col overflow-hidden shrink-0" style={{ width, background: '#16162a', borderRight: '1px solid rgba(255,255,255,0.04)' }} onClick={() => menu && closeMenu()} onContextMenu={event => showMenu(event, '', true, true)}>
    <div className="flex items-center justify-between px-4 h-9 shrink-0"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">Explorer</span><button onClick={() => setCollapsed(true)} className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.04]"><i className="fas fa-chevron-left text-[10px]"></i></button></div>
    <div className="px-4 py-2 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}><div className="flex items-center gap-2"><i className="fas fa-folder text-amber-500/60 text-[11px]"></i><span className="text-[12px] font-medium text-gray-300">{projectName}</span></div></div>
    <div className="flex-1 overflow-y-auto py-1" onContextMenu={event => { if (event.target === event.currentTarget) showMenu(event, '', true, true); }}>
      <FileTreeNode node={fileTree} depth={0} activeFileId={activeFileId} onFileSelect={onFileSelect} expandedFolders={expandedFolders} toggleFolder={toggleFolder} showMenu={showMenu} />
      {files.length === 0 && <div className="px-4 py-3 text-[11px] text-gray-600">Empty project</div>}
    </div>
    <div className="px-4 py-2.5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}><div className="flex items-center gap-2 text-[10px] text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60"></span><span>Zig 0.17.1</span></div></div>
    {menu && <><div className="fixed inset-0 z-[700]" onClick={closeMenu} onContextMenu={event => { event.preventDefault(); closeMenu(); }}></div><div className="fixed z-[701] min-w-[176px] rounded-md border border-white/10 py-1 shadow-2xl" style={{ left: menu.x, top: menu.y, background: '#202033' }} onClick={event => event.stopPropagation()}>
      <button className="menu-item" onClick={() => { closeMenu(); onCreateFile(menuDirectory); }}><i className="fas fa-file-circle-plus w-4"></i>Create File</button>
      <button className="menu-item" onClick={() => { closeMenu(); onCreateFolder(menuDirectory); }}><i className="fas fa-folder-plus w-4"></i>Create Folder</button>
      {!menu.isRoot && <><div className="my-1 border-t border-white/10"></div><button className="menu-item text-red-300 hover:bg-red-500/10" onClick={() => { closeMenu(); onDeletePath(menu.path, menu.isFolder); }}><i className="fas fa-trash w-4"></i>Delete</button></>}
    </div></>}
    <style>{`.menu-item{display:flex;align-items:center;gap:9px;width:100%;padding:7px 12px;text-align:left;font-size:12px;color:#cbd5e1}.menu-item:hover{background:rgba(255,255,255,.07);color:#fff}`}</style>
  </div>;
}

function buildFileTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: 'root', path: '', isFolder: true, children: [] };
  for (const file of files) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean); let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join('/'); let folder = current.children.find(child => child.name === parts[i] && child.isFolder);
      if (!folder) { folder = { name: parts[i], path: folderPath, isFolder: true, children: [] }; current.children.push(folder); } current = folder;
    }
    if (parts.at(-1) === '.gitkeep') continue;
    current.children.push({ name: parts.at(-1) || file.name, path: parts.join('/'), isFolder: false, children: [], file });
  }
  const sort = (node: TreeNode) => { node.children.sort((a,b) => a.isFolder !== b.isFolder ? (a.isFolder ? -1 : 1) : a.name.localeCompare(b.name)); node.children.forEach(sort); }; sort(root); return root;
}
interface NodeProps { node: TreeNode; depth: number; activeFileId: string; onFileSelect: (id: string) => void; expandedFolders: Set<string>; toggleFolder: (path: string) => void; showMenu: (event: React.MouseEvent, path: string, isFolder: boolean, isRoot?: boolean) => void }
function FileTreeNode({ node, depth, activeFileId, onFileSelect, expandedFolders, toggleFolder, showMenu }: NodeProps) {
  if (node.name === 'root') return <>{node.children.map(child => <FileTreeNode key={child.path} node={child} depth={depth} activeFileId={activeFileId} onFileSelect={onFileSelect} expandedFolders={expandedFolders} toggleFolder={toggleFolder} showMenu={showMenu} />)}</>;
  const active = node.file?.id === activeFileId; const expanded = expandedFolders.has(node.path);
  if (node.isFolder) return <div><button onClick={() => toggleFolder(node.path)} onContextMenu={event => showMenu(event, node.path, true)} className="w-full flex items-center gap-1.5 py-[5px] text-[12px] text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]" style={{ paddingLeft: `${depth * 12 + 12}px` }}><i className={`fas fa-chevron-${expanded ? 'down' : 'right'} text-[7px] text-gray-600 w-3`}></i><i className={`fas fa-folder${expanded ? '-open' : ''} text-amber-500/50 text-[11px] w-4 text-center`}></i><span className="truncate">{node.name}</span></button>{expanded && <div>{node.children.map(child => <FileTreeNode key={child.path} node={child} depth={depth + 1} activeFileId={activeFileId} onFileSelect={onFileSelect} expandedFolders={expandedFolders} toggleFolder={toggleFolder} showMenu={showMenu} />)}</div>}</div>;
  const icon = node.name.endsWith('.zig') ? 'fa-code' : node.name.endsWith('.md') ? 'fa-file-lines' : node.name.endsWith('.json') ? 'fa-file-code' : 'fa-file';
  return <button onClick={() => node.file && onFileSelect(node.file.id)} onContextMenu={event => showMenu(event, node.path, false)} className={`w-full flex items-center gap-1.5 py-[5px] text-[12px] ${active ? 'bg-white/[0.06] text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'}`} style={{ paddingLeft: `${depth * 12 + 28}px` }}><i className={`fas ${icon} text-[10px] w-4 text-center`}></i><span className="truncate">{node.name}</span></button>;
}
