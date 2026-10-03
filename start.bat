@echo off
title Ma Collection One Piece
cd /d "%~dp0"

if not exist node_modules (
  echo Installation des dependances...
  call npm install || goto :error
)
if not exist dist (
  echo Construction de l'interface...
  call npm run build || goto :error
)

call npm start
goto :eof

:error
echo.
echo Une erreur est survenue. Appuie sur une touche pour fermer.
pause >nul
