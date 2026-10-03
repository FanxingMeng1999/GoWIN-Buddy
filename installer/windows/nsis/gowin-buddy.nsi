Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name "GoWIN!Buddy"
OutFile "${DISTDIR}\GoWINBuddy-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\GoWINBuddy"
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "${ROOT}\apps\pet-desktop\assets\icon.ico"
UninstallIcon "${ROOT}\apps\pet-desktop\assets\icon.ico"
Var QAInstall

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$WINDIR\System32\wscript.exe"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchGoWINBuddy
!define MUI_FINISHPAGE_RUN_TEXT "$(GoWINLaunchText)"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
LangString GoWINLaunchText 1033 "Launch GoWIN!Buddy"
LangString GoWINLaunchText 2052 "启动 GoWIN!Buddy"

VIProductVersion "${APPVERSION}.0"
VIAddVersionKey /LANG=2052 "ProductName" "GoWIN!Buddy"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APPVERSION}"
VIAddVersionKey /LANG=2052 "FileVersion" "${APPVERSION}"
VIAddVersionKey /LANG=2052 "FileDescription" "GoWIN!Buddy Windows 安装程序"
VIAddVersionKey /LANG=2052 "LegalCopyright" "FanxingMeng1999; MIT License"

Function LaunchGoWINBuddy
  Exec '"$WINDIR\System32\wscript.exe" "$INSTDIR\GoWINBuddy.vbs"'
FunctionEnd

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
  SetShellVarContext current
  StrCpy $QAInstall "0"
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/QA" $1
  ${IfNot} ${Errors}
    StrCpy $QAInstall "1"
  ${EndIf}
FunctionEnd

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${BUNDLEROOT}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ; /QA permits isolated automated installation without changing user shortcuts or registration.
  ${If} $QAInstall == "1"
    FileOpen $0 "$INSTDIR\qa-install.marker" w
    FileWrite $0 "GoWIN!Buddy isolated installation verification"
    FileClose $0
  ${Else}
    CreateDirectory "$SMPROGRAMS\GoWINBuddy"
    CreateShortcut "$SMPROGRAMS\GoWINBuddy\GoWIN!Buddy.lnk" "$WINDIR\System32\wscript.exe" '"$INSTDIR\GoWINBuddy.vbs"' "$INSTDIR\pet-dist\win-unpacked\resources\icon.ico"
    CreateShortcut "$SMPROGRAMS\GoWINBuddy\卸载 GoWIN!Buddy.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\pet-dist\win-unpacked\resources\icon.ico"
    CreateShortcut "$DESKTOP\GoWIN!Buddy.lnk" "$WINDIR\System32\wscript.exe" '"$INSTDIR\GoWINBuddy.vbs"' "$INSTDIR\pet-dist\win-unpacked\resources\icon.ico"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "DisplayName" "GoWIN!Buddy"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "DisplayVersion" "${APPVERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "Publisher" "FanxingMeng1999"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "DisplayIcon" "$INSTDIR\pet-dist\win-unpacked\resources\icon.ico"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "NoRepair" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy" "EstimatedSize" ${ESTSIZEKB}
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\qa-install.marker" skip_registration
    Delete "$SMPROGRAMS\GoWINBuddy\GoWIN!Buddy.lnk"
    Delete "$SMPROGRAMS\GoWINBuddy\验收工具.lnk"
    Delete "$SMPROGRAMS\GoWINBuddy\卸载 GoWIN!Buddy.lnk"
    RMDir "$SMPROGRAMS\GoWINBuddy"
    Delete "$DESKTOP\GoWIN!Buddy.lnk"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy"
  skip_registration:
  ; Remove application-owned entries only. User state remains in APPDATA.
  RMDir /r "$INSTDIR\pet-dist"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\configs"
  RMDir /r "$INSTDIR\scripts\windows"
  RMDir "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\apps\rpg-hub"
  RMDir "$INSTDIR\apps"
  RMDir /r "$INSTDIR\runtime\python"
  RMDir /r "$INSTDIR\runtime\node"
  RMDir "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\brand-assets"
  Delete "$INSTDIR\docs\user-guide.zh-CN.md"
  Delete "$INSTDIR\docs\user-guide.en.md"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
  RMDir "$INSTDIR\docs"
  Delete "$INSTDIR\GoWINBuddy.Launcher.ps1"
  Delete "$INSTDIR\GoWINBuddy.vbs"
  Delete "$INSTDIR\build-manifest.json"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\qa-install.marker"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
