#!/bin/sh
# 새 버전 올리기: package.json의 version을 올린 뒤 실행 → GitHub Releases에 올라가고, 설치된 PC들이 자동으로 받는다.
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
npx tsc -b && npx vite build
rm -rf release && npx electron-builder --win nsis --x64 --publish never
F=release/CoolInbox-Setup-$V.exe
H=$(openssl dgst -sha512 -binary "$F" | base64 | tr -d '\n')
S=$(wc -c < "$F" | tr -d ' ')
printf "version: %s\nfiles:\n  - url: %s\n    sha512: %s\n    size: %s\npath: %s\nsha512: %s\nreleaseDate: '%s'\n" \
  "$V" "$(basename "$F")" "$H" "$S" "$(basename "$F")" "$H" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > release/latest.yml
gh release create "v$V" "$F" "$F.blockmap" release/latest.yml -R a11y526/cool-inbox --title "$V" --notes "${NOTES:-버전 $V}"
