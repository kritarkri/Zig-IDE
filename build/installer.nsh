!macro customInstall
  ; Adds a separate Explorer verb without silently changing the default app.
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.zig\shell\Edit with Zig IDE" "" "Edit with Zig IDE"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.zig\shell\Edit with Zig IDE" "Icon" '"$INSTDIR\Zig IDE.exe",0'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.zig\shell\Edit with Zig IDE\command" "" '"$INSTDIR\Zig IDE.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.zig\shell\Edit with Zig IDE"
!macroend
