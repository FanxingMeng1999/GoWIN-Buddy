@echo off
setlocal DisableDelayedExpansion
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if not exist "%ROOT%\scripts\windows\Invoke-GoWINInteractionHealthCheck.ps1" (
  if exist "%ROOT%\..\scripts\windows\Invoke-GoWINInteractionHealthCheck.ps1" set "ROOT=%ROOT%\.."
)
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "MODE="
set "NOPAUSE=0"
set "STRESS_MINUTES=30"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--no-pause" (
  set "NOPAUSE=1"
  shift
  goto :parse_args
)
if /I "%~1"=="--stress-minutes" (
  if "%~2"=="" (
    echo [GoWIN QA] Missing value for --stress-minutes
    set "EXITCODE=2"
    goto :after_run
  )
  set "STRESS_MINUTES=%~2"
  shift
  shift
  goto :parse_args
)
set "ARG=%~1"
if /I "%ARG:~0,17%"=="--stress-minutes=" (
  set "STRESS_MINUTES=%ARG:~17%"
  shift
  goto :parse_args
)
if "%MODE%"=="" (
  set "MODE=%~1"
  shift
  goto :parse_args
)
echo [GoWIN QA] Unknown argument: %~1
echo Usage:
echo   GoWINBuddy-QA.bat ^<interaction^|stress^|dashboard-e2e^|all^|all-quick^> [--stress-minutes N] [--no-pause]
set "EXITCODE=2"
goto :after_run

:args_done
if "%MODE%"=="" set "MODE=interaction"
for /f "delims=0123456789" %%A in ("%STRESS_MINUTES%") do set "STRESS_INVALID=1"
if not "%STRESS_INVALID%"=="" (
  echo [GoWIN QA] Invalid --stress-minutes value: %STRESS_MINUTES%
  set "EXITCODE=2"
  goto :after_run
)
if "%STRESS_MINUTES%"=="0" (
  echo [GoWIN QA] --stress-minutes must be greater than 0
  set "EXITCODE=2"
  goto :after_run
)

if /I "%MODE%"=="all" goto :run_all
if /I "%MODE%"=="all-quick" goto :run_all_quick
if /I "%MODE%"=="interaction" goto :run_single
if /I "%MODE%"=="stress" goto :run_single
if /I "%MODE%"=="dashboard-e2e" goto :run_single

echo [GoWIN QA] Unknown mode: %MODE%
echo Usage:
echo   GoWINBuddy-QA.bat ^<interaction^|stress^|dashboard-e2e^|all^|all-quick^> [--stress-minutes N] [--no-pause]
set "EXITCODE=2"
goto :after_run

:run_single
call :run_step "%MODE%"
set "EXITCODE=%ERRORLEVEL%"
goto :after_run

:run_all
echo [GoWIN QA] Running full QA suite: interaction + dashboard-e2e + stress(%STRESS_MINUTES%m)
goto :run_all_common

:run_all_quick
if "%STRESS_MINUTES%"=="30" set "STRESS_MINUTES=5"
echo [GoWIN QA] Running quick full QA suite: interaction + dashboard-e2e + stress(%STRESS_MINUTES%m)

:run_all_common
set "EXITCODE=0"
set "FAILED_STEPS="
call :run_step "interaction"
set "STEP_EXIT=%ERRORLEVEL%"
if not "%STEP_EXIT%"=="0" (
  if "%EXITCODE%"=="0" set "EXITCODE=%STEP_EXIT%"
  set "FAILED_STEPS=%FAILED_STEPS% interaction"
)
call :run_step "dashboard-e2e"
set "STEP_EXIT=%ERRORLEVEL%"
if not "%STEP_EXIT%"=="0" (
  if "%EXITCODE%"=="0" set "EXITCODE=%STEP_EXIT%"
  set "FAILED_STEPS=%FAILED_STEPS% dashboard-e2e"
)
call :run_step "stress"
set "STEP_EXIT=%ERRORLEVEL%"
if not "%STEP_EXIT%"=="0" (
  if "%EXITCODE%"=="0" set "EXITCODE=%STEP_EXIT%"
  set "FAILED_STEPS=%FAILED_STEPS% stress"
)
if "%FAILED_STEPS%"=="" (
  echo [GoWIN QA] Full suite finished with PASS.
) else (
  echo [GoWIN QA] Full suite failed at:%FAILED_STEPS%
)
goto :after_run

:run_step
if /I "%~1"=="interaction" goto :step_interaction
if /I "%~1"=="dashboard-e2e" goto :step_dashboard
if /I "%~1"=="stress" goto :step_stress
echo [GoWIN QA] Unknown step: %~1
exit /b 2

:step_interaction
echo [GoWIN QA] Running interaction health check...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\Invoke-GoWINInteractionHealthCheck.ps1" -Root "%ROOT%"
exit /b %ERRORLEVEL%

:step_dashboard
echo [GoWIN QA] Running dashboard sync check...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\Invoke-GoWINDashboardSyncCheck.ps1" -Root "%ROOT%"
exit /b %ERRORLEVEL%

:step_stress
echo [GoWIN QA] Running %STRESS_MINUTES%-minute stress check...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\Invoke-GoWINStress.ps1" -Root "%ROOT%" -DurationMinutes %STRESS_MINUTES%
exit /b %ERRORLEVEL%

:after_run
if "%EXITCODE%"=="0" (
  echo [GoWIN QA] PASS
) else (
  echo [GoWIN QA] FAIL (exit code: %EXITCODE%)
)
if "%NOPAUSE%"=="0" (
  echo.
  echo Press any key to close.
  pause >nul
)
exit /b %EXITCODE%
