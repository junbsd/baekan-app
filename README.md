# 🔧 배관사무소 작업일지

## 설치 방법

1. `src/firebase.js` — Firebase 설정값 입력
2. `package.json` — GitHub 아이디 입력 (homepage)
3. `npm install`
4. `npm run deploy`

## 파일 구조
```
src/
├── App.jsx                  ← 메인 앱 (라우팅)
├── firebase.js              ← Firebase 설정 ⭐수정필요
├── index.js
├── styles/theme.js          ← 공통 스타일·색상·포맷터
├── components/
│   ├── ProfileSetup.jsx     ← 최초 프로필 설정
│   ├── TagInput.jsx         ← 발주업체·장비 태그 입력
│   └── MediaUploader.jsx    ← 사진·영상 업로드
└── pages/
    ├── Dashboard.jsx        ← 대시보드
    ├── WorkForm.jsx         ← 작업 입력·수정
    ├── WorkList.jsx         ← 매출일지·보고서
    ├── ExpenseList.jsx      ← 지출일지
    └── Settings.jsx         ← 설정·관리
```

## 백업
backup-tool/README.txt 참고
