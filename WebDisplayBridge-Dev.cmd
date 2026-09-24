@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Development dependencies are missing. Run npm ci in C:\webMonitor first.
  pause
  exit /b 1
)

call npm.cmd run build:native
if errorlevel 1 goto failed

call npm.cmd start
if errorlevel 1 goto failed
exit /b 0

:failed
echo Development launch failed. Review the error above.
pause
exit /b 1
