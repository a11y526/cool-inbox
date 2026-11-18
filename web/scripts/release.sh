#!/bin/sh
# 새 버전 올리기: package.json의 version을 올리고 커밋한 뒤 실행한다.
# 태그를 올리면 GitHub Actions(Windows)가 설치 파일을 만들어 Releases에 올리고, 설치된 PC들이 자동으로 받는다.
# (Mac에서 만든 설치 파일은 제거 프로그램이 망가져서, 꼭 Windows에서 만든다)
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
git push
git tag "v$V"
git push origin "v$V"
echo "v$V 태그를 올렸어요. 빌드: gh run list -R a11y526/cool-inbox"
