# 쿨메신저 젠투 쪽지 저장 방식 (ClassDesk 3.5.26 설치 파일을 실행하지 않고 풀어서 확인, 2026-11-17)

- 위치: `%LOCALAPPDATA%\CoolMessenger\Memo\<이름>.udb` — SQLite (WAL 사용, `-wal` 파일 함께)
- 받은 쪽지 테이블: `tbl_recv`
  - `MessageKey` (정수, 키), `Title`, `Sender`, `ReceiveDate` (`2026/11/02 11:04:22 (월)` 형식 문자열),
    `IsUnRead`, `FilePath`, `MessageBody`, `DeletedDate` (지운 쪽지는 값이 있음)
  - 글자 칸은 보통 UTF-8, 가끔 EUC-KR → blob으로 읽어서 UTF-8 실패 시 EUC-KR로 디코드
- 본문: `{COMP}` + base64(zlib deflate) → 풀면 UTF-16LE HTML (BOM 있을 수 있음). 접두어 없으면 그대로 텍스트.
- 첨부(`FilePath`): `|개수|id들|폴더|파일이름|크기|폴더|파일이름|크기|` — `C:\...` 폴더 다음 칸이 파일 이름.
  실제 파일은 PC의 받은 파일 폴더(기본 `문서\CoolMessenger Files\Received Files`)에 있음.
- 읽기 전용으로만 열 것 (쿨메신저 DB를 절대 수정하지 않기).
- ClassDesk는 이걸 구글 드라이브 appDataFolder에 올려 휴대폰과 공유함 → 새 앱에서는 이 부분을 PC↔휴대폰 직접 연결로 바꿀 예정.
