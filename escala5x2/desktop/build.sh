#!/bin/sh
# Gera o programa para Windows em desktop/out/ (rode a partir da pasta desktop)
#   ./build.sh            -> versão completa  (Escala 5x2.exe)
#   ./build.sh simples    -> versão simplificada (Escala 5x2 Simples.exe)
set -e
(cd ../web && npm install && npm run build:standalone)
if [ "$1" = "simples" ]; then
  cp ../web/dist/simples-desktop.html app/index.html; NAME="Escala 5x2 Simples"
else
  cp ../web/dist/desktop.html app/index.html; NAME="Escala 5x2"
fi
npm install
npx electron-packager . "$NAME" --platform=win32 --arch=x64 --out=out --icon=icon.ico --overwrite --asar \
  --ignore="^/out" --ignore="^/icon.ico" --ignore="^/build.sh"
# para macOS: troque --platform=darwin --arch=arm64 (Apple Silicon) ou x64 (Intel)
