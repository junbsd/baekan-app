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
  │   ├── users.json
  │   ├── clients.json
  │   └── equipment.json
  ├── photos/             ← 현장 사진 전체
  ├── videos/             ← 현장 영상 전체
  └── 백업요약.txt        ← 백업 결과 요약

  ※ 90일 이상 된 백업은 자동 삭제됩니다

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
