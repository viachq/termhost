@echo off
REM termhost-bridge-wrapper.cmd
REM Sets TERMHOST_TERM_ID from WT's commandline argument
REM WT opens this profile directly (without --) and the bridge
REM reads the terminal ID from the environment variable.

if not "%1"=="" (
    set "TERMHOST_TERM_ID=%1"
)

"C:\Users\viach\Desktop\termhost\daemon\target\release\termhost-bridge.exe"
