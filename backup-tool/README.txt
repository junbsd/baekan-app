━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 배관사무소 백업 도구 사용 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[처음 한 번만 설정]

STEP 1. 서비스 계정 키 파일 받기
  ① Firebase 콘솔 접속 (console.firebase.google.com)
  ② 왼쪽 상단 톱니바퀴(⚙️) → '프로젝트 설정' 클릭
  ③ '서비스 계정' 탭 클릭
  ④ 'Node.js' 선택 확인 후
     '새 비공개 키 생성' 버튼 클릭
  ⑤ 다운로드된 JSON 파일을
     이 폴더(backup-tool)에 복사
  ⑥ 파일 이름을 serviceAccountKey.json 으로 변경

STEP 2. backup.js 파일 수정
  backup.js 파일을 텍스트 편집기로 열어서
  STORAGE_BUCKET 값을 firebase.js의
  storageBucket 값으로 교체
  예) 'baekan-app.appspot.com'

STEP 3. 패키지 설치 (처음 한 번만)
  터미널에서:
  cd backup-tool
  npm install

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[백업 실행 (월 1회 권장)]

  터미널에서:
  cd backup-tool
  node backup.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[백업 결과물]

  backups/backup_날짜/ 폴더에 저장됨
  ├── data/
  │   ├── works.csv       ← 엑셀에서 바로 열기 가능
  │   ├── works.json
  │   ├── expenses.csv    ← 엑셀에서 바로 열기 가능
  │   ├── expenses.json
  │   ├── opinions.csv    ← 엑셀에서 바로 열기 가능 (소견서)
  │   ├── opinions.json
  │   ├── users.json
  │   ├── clients.json
  │   └── equipment.json
  ├── photos/             ← 현장 사진 전체
  ├── videos/             ← 현장 영상 전체
  ├── signatures/         ← 작업자 서명·도장 이미지
  └── 백업요약.txt        ← 백업 결과 요약

  ※ 90일 이상 된 백업은 자동 삭제됩니다

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Mac에서 매월 자동 백업 설정 (launchd)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

매번 직접 실행하지 않고, 매월 1일 새벽 3시에
자동으로 백업되도록 설정할 수 있습니다.

STEP 1. node 설치 경로 확인
  터미널에서:
  which node
  → 예: /usr/local/bin/node 또는 /opt/homebrew/bin/node

STEP 2. com.baekan.backup.plist 파일 수정
  이 폴더의 com.baekan.backup.plist 파일을 열어서
  ① ProgramArguments의 node 경로를 STEP 1에서 확인한 값으로 교체
  ② "/Users/내사용자명/baekan-app/..." 부분을
     실제 본인의 폴더 경로로 모두 교체
     (Finder에서 backup-tool 폴더를 선택하고
      Cmd+I 또는 우클릭 → "정보 가져오기"로 경로 확인 가능)

STEP 3. plist 파일을 LaunchAgents 폴더로 복사
  터미널에서:
  cp com.baekan.backup.plist ~/Library/LaunchAgents/

STEP 4. 등록 및 활성화
  터미널에서:
  launchctl load ~/Library/LaunchAgents/com.baekan.backup.plist

  ※ 컴퓨터를 껐다 켜도 자동으로 유지됩니다.
  ※ 단, 예약된 시간에 Mac이 꺼져있거나 잠자기 상태면
     실행되지 않습니다. 가능하면 매월 자주 켜두는 시간대로
     설정하거나, 백업이 잘 됐는지 가끔 확인해주세요.

[확인 방법]
  backup-tool 폴더의 backup_log.txt 파일을 열면
  최근 실행 결과를 볼 수 있습니다.
  오류가 있다면 backup_error.txt에 기록됩니다.

[등록 해제하고 싶을 때]
  launchctl unload ~/Library/LaunchAgents/com.baekan.backup.plist

[설정을 바꾸고 다시 적용하고 싶을 때]
  launchctl unload ~/Library/LaunchAgents/com.baekan.backup.plist
  (plist 파일 수정 후)
  launchctl load ~/Library/LaunchAgents/com.baekan.backup.plist

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[백업 파일도 클라우드에 보관하면 더 안전합니다]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 컴퓨터에 문제가 생기면 로컬 백업도 함께 사라질 수 있습니다.
backup-tool/backups 폴더를 통째로
Google Drive, Dropbox, iCloud Drive 같은
클라우드 동기화 폴더 안으로 옮겨두면,
컴퓨터와 별개로 안전하게 보관됩니다.

예) backups 폴더를 ~/Google Drive/배관사무소백업 안으로 이동
   (BACKUP_ROOT 경로를 backup.js 상단에서 그 경로로 수정하면
    백업 시 자동으로 그 위치에 저장됩니다)

