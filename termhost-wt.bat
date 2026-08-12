@echo off
REM termhost-wt.bat - Launch a termhost terminal in Windows Terminal
REM Usage: termhost-wt.bat <terminal-id>
REM If no ID given, lists available terminals

setlocal enabledelayedexpansion

if "%1"=="" (
    echo termhost terminals:
    echo   List all terminals using:
    echo   curl -s http://localhost:9090/ ^| grep -oP '"id":"term-[^"]*"'
    echo.
    echo Usage: %~nx0 ^<terminal-id^>
    exit /b 1
)

REM Launch Windows Terminal with termhost bridge profile
wt.exe -w 0 nt --profile termhost-bridge -- "%1"
