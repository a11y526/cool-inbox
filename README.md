# 쿨메신저 쪽지함

쿨메신저 젠투로 받은 쪽지를 휴대폰에서 볼 수 있게 해 주는 프로그램입니다. (개발 중)

- **학교 PC 프로그램** (`web/`, Windows): 쿨메신저가 이 PC에 저장한 받은 쪽지를 **읽기만** 합니다. 쿨메신저 파일은 고치지 않습니다.
- 지금 버전은 학교 PC와 휴대폰이 학교 네트워크에서 직접 연결되는지 확인하는 **연결 테스트**까지 들어 있습니다. 쪽지는 아직 휴대폰으로 보내지 않습니다.
- 컴퓨터를 켜면 알림 영역에서 자동으로 실행되고, 새 버전은 GitHub Releases에서 자동으로 받아 설치됩니다.

## 설치

[Releases](https://github.com/a11y526/cool-inbox/releases/latest)에서 `CoolInbox-Setup-*.exe`를 받아 실행합니다.
코드 서명이 없어서 Windows가 경고를 띄우면 「추가 정보 → 실행」을 누릅니다.

## 개발

```bash
cd web
npm install
npm run sample   # 가짜 예시 쪽지 파일 만들기 (sample/)
npm run dev      # 브라우저에서 화면 보기
npm run desktop  # PC 프로그램으로 실행 (예시 쪽지 사용)
```

쿨메신저 쪽지 저장 형식은 [NOTES-coolmessenger.md](NOTES-coolmessenger.md)에 정리되어 있습니다.
