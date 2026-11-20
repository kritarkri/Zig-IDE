import { FileItem } from '../types';

interface StatusBarProps {
  activeFile: FileItem | undefined;
  hasChanges: boolean;
}

export default function StatusBar({ activeFile, hasChanges }: StatusBarProps) {
  return (
    <div className="h-[22px] flex items-center justify-between px-3 text-[10px] shrink-0 select-none" style={{ background: '#16162a', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {/* Branch */}
        <div className="flex items-center gap-1.5 text-gray-500 hover:text-gray-400 cursor-pointer transition-colors duration-150">
          <i className="fas fa-code-branch text-[9px]"></i>
          <span>main</span>
        </div>

        {/* Errors/Warnings */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 text-gray-500 hover:text-gray-400 cursor-pointer transition-colors duration-150">
            <i className="fas fa-circle-xmark text-[9px] text-red-400/50"></i>
            <span>0</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 hover:text-gray-400 cursor-pointer transition-colors duration-150">
            <i className="fas fa-triangle-exclamation text-[9px] text-amber-400/50"></i>
            <span>0</span>
          </div>
        </div>

        {/* Sync */}
        <div className="flex items-center gap-1.5 text-gray-600">
          <i className="fas fa-sync text-[8px]"></i>
          <span>synced</span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Cursor Position */}
        {activeFile && (
          <div className="flex items-center gap-2.5 text-gray-600">
            <span>Ln 1, Col 1</span>
            <span>Spaces: 4</span>
            <span>UTF-8</span>
          </div>
        )}

        {/* Language */}
        {activeFile && (
          <div className="flex items-center gap-1.5 text-gray-500 hover:text-gray-400 cursor-pointer transition-colors duration-150">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50"></span>
            <span>{activeFile.language === 'zig' ? 'Zig' : activeFile.language}</span>
          </div>
        )}

        {/* Modified indicator */}
        {hasChanges && (
          <div className="flex items-center gap-1 text-amber-400/60">
            <span className="w-1 h-1 rounded-full bg-amber-400/60"></span>
            <span>modified</span>
          </div>
        )}

        {/* Zig version */}
        <div className="flex items-center gap-1.5 text-gray-600">
          <div className="w-3 h-3 rounded-sm bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400/70 text-[6px] font-bold">Z</span>
          </div>
          <span>0.17.1</span>
        </div>
      </div>
    </div>
  );
}
