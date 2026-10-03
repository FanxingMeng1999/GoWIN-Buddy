@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if not exist "%ROOT%\launcher\windows\GoWINBuddy.Launcher.ps1" (
  if exist "%ROOT%\..\launcher\windows\GoWINBuddy.Launcher.ps1" set "ROOT=%ROOT%\.."
)
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "LAUNCHER=%ROOT%\launcher\windows\GoWINBuddy.Launcher.ps1"
if not exist "%LAUNCHER%" set "LAUNCHER=%ROOT%\GoWINBuddy.Launcher.ps1"
if not exist "%LAUNCHER%" (
  echo launcher not found under "%ROOT%"
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" -Action launch -Root "%ROOT%"
endlocal
