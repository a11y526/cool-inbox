; 설치·업데이트 전에 켜져 있는 쪽지함을 끈다.
; 창을 닫아도 알림 영역에 남는 프로그램이라 기본 "닫기 요청"으로는 꺼지지 않아서 강제로 끈다.
; 예전 버전(실행 파일 이름이 한글)과 새 버전(CoolInbox.exe) 모두.
!macro customCheckAppRunning
  DetailPrint "켜져 있는 쿨메신저 쪽지함을 끄는 중"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-Process -Name 'CoolInbox','쿨메신저 쪽지함' -ErrorAction SilentlyContinue | Stop-Process -Force"`
  Pop $0
  Sleep 1000
!macroend
