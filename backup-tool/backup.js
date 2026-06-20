// ================================================================
// 배관사무소 작업일지 백업 도구
// 실행: node backup.js
// ================================================================

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── ⚠️ 여기만 수정하세요 ─────────────────────────────────────
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const STORAGE_BUCKET = '여기에_storageBucket_값_입력';  // 예: baekan-app.appspot.com
const BACKUP_ROOT = path.join(__dirname, 'backups');
// ──────────────────────────────────────────────────────────────

const today = new Date();
const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const backupDir = path.join(BACKUP_ROOT, `backup_${dateStr}`);

const fmtMoney = (n) => n ? Number(n).toLocaleString('ko-KR') + '원' : '0원';
const fmtDate  = (d) => d ? d.slice(0,10).replace(/-/g,'.') : '-';
const fmtPhone = (p) => p ? p.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '-';
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`);

function csvCell(val) {
  const str = String(val ?? '').replace(/"/g, '""');
  return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlink(dest, ()=>{});
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, ()=>{}); reject(err); });
  });
}

async function runBackup() {
  console.log('\n🔧 배관사무소 작업일지 백업 시작');
  console.log('='.repeat(52));

  // Firebase Admin 초기화
  let serviceAccount;
  try {
    serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  } catch(e) {
    console.error('\n❌ serviceAccountKey.json 파일을 찾을 수 없습니다.');
    console.error('   README.txt를 참고해서 파일을 준비해주세요.');
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount), storageBucket: STORAGE_BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket();

  // 폴더 생성
  ['', 'photos', 'videos', 'data'].forEach(sub =>
    fs.mkdirSync(path.join(backupDir, sub), { recursive: true })
  );
  log(`백업 폴더: ${backupDir}`);

  // ── 1. works 백업 ──────────────────────────────────────────
  log('작업일지 불러오는 중...');
  const worksSnap = await db.collection('works').orderBy('date', 'desc').get();
  const works = worksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  log(`작업일지 ${works.length}건`);

  // JSON
  fs.writeFileSync(path.join(backupDir, 'data', 'works.json'), JSON.stringify(works, null, 2), 'utf8');

  // CSV (엑셀용 BOM 포함)
  const PAY = { cash:'현금', card:'카드', credit:'외상' };
  const wHeader = '날짜,발주업체,시공장소,작업자,전화번호,작업자업체,시공내용,사용장비,작업시간,금액,결제방식,메모,사진수,작성일';
  const wRows = works.map(w => [
    csvCell(fmtDate(w.date)), csvCell(w.clientCompany), csvCell(w.location),
    csvCell(w.workerName), csvCell(fmtPhone(w.workerPhone)), csvCell(w.workerCompany),
    csvCell(w.content), csvCell((w.equipment||[]).join(' / ')),
    csvCell(w.workHours), csvCell(w.amount), csvCell(PAY[w.payment]||w.payment),
    csvCell(w.memo), csvCell((w.files||[]).length), csvCell(w.createdAt),
  ].join(','));
  fs.writeFileSync(path.join(backupDir,'data','works.csv'), '\uFEFF'+[wHeader,...wRows].join('\n'), 'utf8');
  log('works.json + works.csv 저장 완료');

  // ── 2. expenses 백업 ───────────────────────────────────────
  log('지출 데이터 불러오는 중...');
  const expSnap = await db.collection('expenses').orderBy('date','desc').get();
  const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  log(`지출 ${expenses.length}건`);

  fs.writeFileSync(path.join(backupDir,'data','expenses.json'), JSON.stringify(expenses,null,2),'utf8');
  const eHeader = '날짜,항목,내용,금액,메모,작성일';
  const eRows = expenses.map(e=>[
    csvCell(fmtDate(e.date)), csvCell(e.category), csvCell(e.desc),
    csvCell(e.amount), csvCell(e.memo), csvCell(e.createdAt),
  ].join(','));
  fs.writeFileSync(path.join(backupDir,'data','expenses.csv'), '\uFEFF'+[eHeader,...eRows].join('\n'), 'utf8');
  log('expenses.json + expenses.csv 저장 완료');

  // ── 3. users 백업 ──────────────────────────────────────────
  const userSnap = await db.collection('users').get();
  const users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  fs.writeFileSync(path.join(backupDir,'data','users.json'), JSON.stringify(users,null,2),'utf8');
  log(`사용자 ${users.length}명 백업 완료`);

  // ── 4. clients/equipment 백업 ──────────────────────────────
  const [cSnap, eqSnap] = await Promise.all([
    db.collection('clients').get(),
    db.collection('equipment').get(),
  ]);
  fs.writeFileSync(path.join(backupDir,'data','clients.json'),
    JSON.stringify(cSnap.docs.map(d=>({id:d.id,...d.data()})),null,2),'utf8');
  fs.writeFileSync(path.join(backupDir,'data','equipment.json'),
    JSON.stringify(eqSnap.docs.map(d=>({id:d.id,...d.data()})),null,2),'utf8');
  log('발주업체·장비 목록 백업 완료');

  // ── 5. 사진·영상 다운로드 ──────────────────────────────────
  const allFiles = works.flatMap(w =>
    (w.files||[]).map(f => ({ ...f, workDate:w.date, workClient:w.clientCompany }))
  );
  const images = allFiles.filter(f=>f.type==='image');
  const videos = allFiles.filter(f=>f.type==='video');

  log(`사진 ${images.length}장, 영상 ${videos.length}개 다운로드 시작...`);
  let ok=0, fail=0;

  for (const f of allFiles) {
    try {
      const subDir = f.type==='video' ? 'videos' : 'photos';
      const safeName = `${fmtDate(f.workDate).replace(/\./g,'-')}_${(f.workClient||'').replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g,'_')}_${f.name||'file'}`.slice(0,80);
      const dest = path.join(backupDir, subDir, safeName);
      if (!fs.existsSync(dest)) await downloadFile(f.url, dest);
      ok++;
      process.stdout.write(`\r  진행: ${ok+fail}/${allFiles.length} (성공:${ok} 실패:${fail})`);
    } catch(e) { fail++; }
  }
  if (allFiles.length > 0) console.log();
  log(`다운로드 완료 — 성공:${ok} 실패:${fail}`);

  // ── 6. 요약 보고서 ──────────────────────────────────────────
  const totalRevenue = works.reduce((s,w)=>s+(Number(w.amount)||0),0);
  const totalExpense = expenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const thisMonth = new Date().toISOString().slice(0,7);
  const mW = works.filter(w=>w.date?.startsWith(thisMonth));
  const mE = expenses.filter(e=>e.date?.startsWith(thisMonth));

  const summary = `배관사무소 작업일지 백업 보고서
생성일시 : ${new Date().toLocaleString('ko-KR')}
백업위치 : ${backupDir}
${'='.repeat(52)}

[전체 누적 현황]
작업 건수     : ${works.length}건
지출 건수     : ${expenses.length}건
총 매출       : ${fmtMoney(totalRevenue)}
총 지출       : ${fmtMoney(totalExpense)}
순이익        : ${fmtMoney(totalRevenue - totalExpense)}
등록 작업자   : ${users.length}명
현장 사진     : ${images.length}장
현장 영상     : ${videos.length}개
발주업체 수   : ${cSnap.size}개
등록 장비 수  : ${eqSnap.size}개

[이번달 (${thisMonth})]
작업 건수     : ${mW.length}건
매출          : ${fmtMoney(mW.reduce((s,w)=>s+(Number(w.amount)||0),0))}
지출          : ${fmtMoney(mE.reduce((s,e)=>s+(Number(e.amount)||0),0))}

[백업 파일 목록]
data/works.csv        ← 엑셀에서 바로 열기 가능
data/works.json       ← 전체 작업 데이터
data/expenses.csv     ← 엑셀에서 바로 열기 가능
data/expenses.json    ← 전체 지출 데이터
data/users.json       ← 작업자 정보
data/clients.json     ← 발주업체 목록
data/equipment.json   ← 장비 목록
photos/               ← 현장 사진 ${images.length}장
videos/               ← 현장 영상 ${videos.length}개
`;

  fs.writeFileSync(path.join(backupDir,'백업요약.txt'), summary, 'utf8');
  console.log('\n'+summary);

  // ── 7. 90일 이상 된 백업 자동 삭제 ─────────────────────────
  const cutoff = Date.now() - 90*24*60*60*1000;
  let cleaned = 0;
  if (fs.existsSync(BACKUP_ROOT)) {
    for (const name of fs.readdirSync(BACKUP_ROOT)) {
      const full = path.join(BACKUP_ROOT, name);
      if (fs.statSync(full).isDirectory() && fs.statSync(full).mtimeMs < cutoff) {
        fs.rmSync(full, { recursive:true, force:true });
        log(`  오래된 백업 삭제: ${name}`); cleaned++;
      }
    }
  }
  if (cleaned === 0) log('정리할 오래된 백업 없음');

  console.log('\n✅ 백업 완료!');
  console.log(`📁 저장 위치: ${backupDir}`);
  console.log('='.repeat(52)+'\n');
  process.exit(0);
}

runBackup().catch(e => {
  console.error('\n❌ 오류:', e.message);
  process.exit(1);
});
