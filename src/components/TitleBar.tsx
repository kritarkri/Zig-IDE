import { useEffect, useRef, useState } from 'react';

export interface EditorActions {
  undo: () => void; redo: () => void; cut: () => void; copy: () => void; paste: () => void;
  find: () => void; replace: () => void; selectAll: () => void; toggleComment: () => void;
  toggleWordWrap: () => void; toggleMinimap: () => void;
}

interface TitleBarProps {
  onSave: () => void; onSaveAs: () => void; onRun: () => void; onBuild: () => void;
  onOpenFile: () => void; onOpenProject: () => void; onStop: () => void; onRunTest: () => void;
  onNewFile: () => void; onNewFolder: () => void; onNewProject: () => void;
  onToggleTerminal: () => void; onToggleSidebar: () => void;
  onPackageManager: () => void; onConfigureZig: () => void; onConfigureZls: () => void;
  onSetupTools: () => void; onExit: () => void; editorActions: EditorActions;
  hasChanges: boolean; projectName?: string;
}

const menus: Record<string, { label: string; action: string; shortcut?: string }[]> = {
  File: [
    { label: 'New Project...', action: 'newproject' }, { label: 'New File', action: 'new', shortcut: 'Ctrl+N' },
    { label: 'New Folder...', action: 'newfolder', shortcut: 'Ctrl+Shift+N' }, { label: 'Open File...', action: 'open', shortcut: 'Ctrl+O' },
    { label: 'Open Project Folder...', action: 'openproject' }, { label: 'Save', action: 'save', shortcut: 'Ctrl+S' },
    { label: 'Save As...', action: 'saveas', shortcut: 'Ctrl+Shift+S' }, { label: 'Exit', action: 'exit' },
  ],
  View: [
    { label: 'Toggle Sidebar', action: 'sidebar', shortcut: 'Ctrl+B' }, { label: 'Toggle Terminal', action: 'terminal', shortcut: 'Ctrl+`' },
    { label: 'Word Wrap', action: 'wordwrap' }, { label: 'Minimap', action: 'minimap' },
  ],
  Tools: [
    { label: 'Set Up Zig and ZLS...', action: 'setup' }, { label: 'Zig Package Manager...', action: 'packages' },
    { label: 'Configure Zig compiler...', action: 'zig' }, { label: 'Configure ZLS...', action: 'zls' },
  ],
  Build: [
    { label: 'Build Executable', action: 'build', shortcut: 'F6' }, { label: 'Run', action: 'run', shortcut: 'F5' },
    { label: 'Stop', action: 'stop' }, { label: 'Run Tests', action: 'test', shortcut: 'Ctrl+Shift+T' },
  ],
  Help: [
    { label: 'Zig Documentation', action: 'docs' }, { label: 'ZLS Project', action: 'zlsproject' },
    { label: 'About Zig IDE', action: 'about' },
  ],
};

export default function TitleBar(props: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  const runAction = (action: string) => {
    setOpenMenu(null);
    const a = props.editorActions;
    switch (action) {
      case 'newproject': props.onNewProject(); break; case 'new': props.onNewFile(); break;
      case 'newfolder': props.onNewFolder(); break; case 'open': props.onOpenFile(); break;
      case 'openproject': props.onOpenProject(); break; case 'save': props.onSave(); break;
      case 'saveas': props.onSaveAs(); break; case 'exit': props.onExit(); break;
      case 'sidebar': props.onToggleSidebar(); break; case 'terminal': props.onToggleTerminal(); break;
      case 'wordwrap': a.toggleWordWrap(); break; case 'minimap': a.toggleMinimap(); break;
      case 'setup': props.onSetupTools(); break; case 'packages': props.onPackageManager(); break;
      case 'zig': props.onConfigureZig(); break; case 'zls': props.onConfigureZls(); break;
      case 'build': props.onBuild(); break; case 'run': props.onRun(); break; case 'stop': props.onStop(); break;
      case 'test': props.onRunTest(); break;
      case 'docs': void window.zigIDE.openExternal('https://ziglang.org/documentation/'); break;
      case 'zlsproject': void window.zigIDE.openExternal('https://github.com/zigtools/zls'); break;
      case 'about': window.alert(`Zig IDE\nVersion 1.3.7\nAn independent IDE for the Zig programming language.`); break;
    }
  };

  return <div className="h-[42px] bg-[#1a1a2e] flex items-center select-none shrink-0 border-b border-white/[0.06]">
    <div className="flex items-center h-full" ref={menuRef}>
      <div className="px-4 h-full flex items-center border-r border-white/[0.06]"><span className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-xs flex items-center justify-center">Z</span></div>
      {Object.entries(menus).map(([name, items]) => <div key={name} className="relative h-full">
        <button className={`h-full px-3 text-[13px] ${openMenu === name ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`} onClick={() => setOpenMenu(openMenu === name ? null : name)} onMouseEnter={() => { if (openMenu) setOpenMenu(name); }}>{name}</button>
        {openMenu === name && <div className="absolute top-full left-0 z-[100] min-w-[245px] py-1.5 rounded-lg border border-white/[0.08] shadow-2xl" style={{ background: '#24243a' }}>
          {items.map(item => <button key={item.action} onClick={() => runAction(item.action)} className="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-white/[0.07] hover:text-white">
            <span className="flex-1 text-[13px]">{item.label}</span>{item.shortcut && <span className="text-[11px] text-gray-500 font-mono">{item.shortcut}</span>}
          </button>)}
        </div>}
      </div>)}
    </div>
    <div className="flex-1"/><div className="text-xs text-gray-500">{props.projectName || 'Zig IDE'}</div><div className="flex-1"/>
    <div className="flex items-center gap-1.5 pr-3 h-full">
      <button onClick={props.onSave} className={`px-3 py-1.5 rounded-md text-xs ${props.hasChanges ? 'text-amber-300 bg-amber-500/10' : 'text-gray-400 hover:bg-white/[0.05]'}`}>Save</button>
      <button onClick={props.onBuild} className="px-3 py-1.5 rounded-md text-xs text-amber-300 hover:bg-amber-500/10">Build</button>
      <button onClick={props.onStop} className="px-2.5 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-500/10">Stop</button>
      <button onClick={props.onRun} className="px-3.5 py-1.5 rounded-md text-xs text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25">Run</button>
      <button onClick={props.onRunTest} className="px-3 py-1.5 rounded-md text-xs text-blue-300 hover:bg-blue-500/10">Test</button>
      <button onClick={props.onToggleTerminal} className="p-2 rounded-md text-gray-400 hover:bg-white/[0.05]" title="Toggle Terminal"><i className="fas fa-terminal"/></button>
    </div>
  </div>;
}
