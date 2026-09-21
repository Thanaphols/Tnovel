@echo off
setlocal
set OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe
if not exist "%OLLAMA_BIN%" (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Ollama executable not found at %LOCALAPPDATA%\Programs\Ollama\ollama.exe or in PATH.
        echo Please ensure Ollama is installed from https://ollama.com
        pause
        exit /b 1
    ) else (
        set OLLAMA_BIN=ollama
    )
)
echo [Tnovel] Launching Ollama model qwen2.5:7b ...
"%OLLAMA_BIN%" run qwen2.5:7b
