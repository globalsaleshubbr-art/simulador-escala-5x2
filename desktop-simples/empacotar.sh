#!/bin/bash
# Gera os programas "Escala 5x2 Simples" para Windows e Mac (Apple Silicon e Intel) a partir do código em ../escala5x2/web.
# Uso: cd desktop-simples && npm install && ./empacotar.sh
# Opcional: RCODESIGN=/caminho/rcodesign para assinar (ad-hoc) os apps de Mac quando o build é feito fora de um Mac.
set -e
cd "$(dirname "$0")"
AQUI=$(pwd)
(cd ../escala5x2/web && npm run build:standalone)
mkdir -p app && cp ../escala5x2/web/dist/simples-desktop.html app/index.html
COMUM=(--overwrite --asar --app-copyright="Escala 5x2" --ignore="^/out" --ignore="^/outmac" --ignore="^/icon.ico" --ignore="^/icon.icns" --ignore="^/empacotar.sh" --ignore="^/LEIA-ME")
# Windows
rm -rf out && npx electron-packager . "Escala 5x2 Simples" --platform=win32 --arch=x64 --out=out --icon=icon.ico "${COMUM[@]}" \
  --win32metadata.CompanyName="Escala 5x2" --win32metadata.FileDescription="Simulador Escala 5x2" --win32metadata.ProductName="Simulador Escala 5x2"
D=$(ls -d out/*/); find "$D/locales" -type f ! -name 'pt-BR.pak' ! -name 'en-US.pak' -delete; cp LEIA-ME-simples.txt "$D"
rm -f "$AQUI/Escala5x2-Simples-Windows.zip" && (cd out && zip -qr "$AQUI/Escala5x2-Simples-Windows.zip" .)
# Mac
rm -rf outmac
for A in arm64 x64; do
  npx electron-packager . "Escala 5x2 Simples" --platform=darwin --arch=$A --out=outmac --icon=icon.icns "${COMUM[@]}" \
    --app-bundle-id=br.escala5x2.simples --app-version=1.0.0 --app-category-type=public.app-category.business --darwin-dark-mode-support
  N=$([ $A = arm64 ] && echo AppleSilicon || echo Intel); DD="outmac/Escala 5x2 Simples-darwin-$A"; APP="$DD/Escala 5x2 Simples.app"
  find "$APP/Contents/Resources" -maxdepth 1 -name "*.lproj" ! -name "pt_BR.lproj" ! -name "pt_PT.lproj" ! -name "en.lproj" -exec rm -rf {} +
  if [ -n "$RCODESIGN" ]; then "$RCODESIGN" sign "$APP"; elif command -v codesign >/dev/null; then codesign --force --deep -s - "$APP"; fi
  cp LEIA-ME-Mac.txt "$DD/"
  rm -f "$AQUI/Escala5x2-Simples-Mac-$N.zip"; (cd "$DD" && zip -qry "$AQUI/Escala5x2-Simples-Mac-$N.zip" "Escala 5x2 Simples.app" LEIA-ME-Mac.txt)
done
ls -la "$AQUI"/Escala5x2-Simples-*.zip
