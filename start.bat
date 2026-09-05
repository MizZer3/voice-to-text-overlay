@echo off
title Gemini Live Overlay
cd /d "%~dp0"
if exist "Gemini Live.exe" (
  start "" "Gemini Live.exe"
  exit
)
if exist "dist\Gemini Live-win32-x64\Gemini Live.exe" (
  start "" "dist\Gemini Live-win32-x64\Gemini Live.exe"
  exit
)
npm start

