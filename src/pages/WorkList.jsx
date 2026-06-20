import { useState, useRef } from "react";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { S, C, fmt, PAY_COLOR, PAY_LABEL } from "../styles/theme";
import MediaUploader from "../components/MediaUploader";
import WorkForm from "./WorkForm";

// ── 작업보고서 이미지 변환 모달 ───────────────────────────────
function ReportModal({ work, onClose }) {
  const reportRef = useRef();
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const images = (work.files||[]).filter(f=>f.type==="image");
  const netAmount = work.netAmount || work.amount;

  const handleGenerateImage = async () => {
    setGenerating(true);
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const canvas = await window.html2canvas(reportRef.current, {
        scale:2, useCORS:true, backgroundColor:"#ffffff", logging:false,
      });
      setImgUrl(canvas.toDataURL("image/jpeg", 0.92));
    } catch(e) { alert("이미지 생성 중 오류가 발생했습니다."); }
    setGenerating(false);
  };

  const handleShare = async () => {
    if (!imgUrl) return;
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], `작업보고서_${work.clientCompany}_${work.date}.jpg`, { type:"image/jpeg" });
      if (navigator.share && navigator.canShare({ files:[file] })) {
        await navigator.share({ title:`작업보고서 - ${work.clientCompany}`, files:[file] });
      } else {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = file.name; a.click();
        alert("이미지가 저장됐습니다. 카카오톡에서 파일 첨부로 전송해주세요.");
      }
    } catch(e) { if (e.name !== "AbortError") { const a=document.createElement("a"); a.href=imgUrl; a.download=`작업보고서_${work.date}.jpg`; a.click(); } }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>작업보고서</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        <div ref={reportRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:20, fontSize:12, marginBottom:14, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>

          {/* ── 헤더 ── */}
          <div style={{ textAlign:"center", marginBottom:14 }}>
            <div style={{ fontSize:24, fontWeight:900, letterSpacing:6, color:"#1f2937", marginBottom:3 }}>작 업 보 고 서</div>
            <div style={{ fontSize:11, color:"#6b7280" }}>배관사무소</div>
            <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
          </div>

          {/* ── 수신/발신/날짜 ── */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
            background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:6,
            padding:"12px 14px", marginBottom:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:6, marginBottom:6, alignItems:"baseline" }}>
                <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>수신</span>
                <span style={{ fontSize:15, fontWeight:800, color:"#1f2937" }}>{work.clientCompany}</span>
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:3, alignItems:"baseline" }}>
                <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>발신</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>
                  {work.workerName}
                  {work.workerCompany ? ` (${work.workerCompany})` : ""}
                </span>
              </div>
              {work.workerPhone && (
                <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
                  <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}></span>
                  <span style={{ fontSize:12, color:"#6b7280" }}>{fmt.phone(work.workerPhone)}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{fmt.date(work.date)}</div>
            </div>
          </div>

          {/* ── 시공 내용 ── */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
            <div style={{ background:"#374151", padding:"6px 12px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>시 공 내 용</span>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <tbody>
                {[
                  ["시공장소", work.location],
                  ["시공내용", work.content],
                  ["사용장비", (work.equipment||[]).join(", ")],
                  ["작업시간", work.workHours],
                ].map(([k,v],i)=> v ? (
                  <tr key={k} style={{ background: i%2===0?"#fff":"#f8fafc" }}>
                    <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>{k}</td>
                    <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{v}</td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>

          {/* ── 결제 내역 ── */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
            <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>결 제 내 역</span>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <tbody>
                <tr style={{ background:"#fff" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>청구금액</td>
                  <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{fmt.money(work.amount)}</td>
                </tr>
                <tr style={{ background:"#f8fafc" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", color:"#374151" }}>수수료</td>
                  <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#ef4444" }}>
                    {work.feeRate > 0 ? `${fmt.money(work.feeAmount)} (${work.feeRate}%)` : "면제"}
                  </td>
                </tr>
                <tr style={{ background:"#eff6ff" }}>
                  <td style={{ padding:"8px 12px", fontWeight:800, fontSize:12, borderBottom:"1px solid #dbeafe", color:"#1e3a5f" }}>실수령액</td>
                  <td style={{ padding:"8px 12px", fontSize:15, fontWeight:800, borderBottom:"1px solid #dbeafe", color:"#1d4ed8" }}>{fmt.money(netAmount)}</td>
                </tr>
                <tr style={{ background:"#fff" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, color:"#374151" }}>결제방식</td>
                  <td style={{ padding:"7px 12px", fontSize:12, color:"#1f2937" }}>{PAY_LABEL[work.payment]}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── 비고 ── */}
          {work.memo && (
            <div style={{ border:"1px solid #fde68a", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
              <div style={{ background:"#fef3c7", padding:"6px 12px" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#92400e", letterSpacing:1 }}>비 고</span>
              </div>
              <div style={{ padding:"8px 12px", fontSize:12, color:"#1f2937", background:"#fffbeb" }}>
                {work.memo}
              </div>
            </div>
          )}

          {/* ── 현장 사진 ── */}
          {images.length > 0 && (
            <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
              <div style={{ background:"#374151", padding:"6px 12px" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>현 장 사 진</span>
              </div>
              <div style={{ padding:10, display:"flex", flexWrap:"wrap", gap:6, background:"#fff" }}>
                {images.slice(0,4).map((f,i)=>(
                  <img key={i} src={f.url} alt="" crossOrigin="anonymous"
                    style={{ width:"calc(50% - 3px)", aspectRatio:"4/3", objectFit:"cover", borderRadius:4 }} />
                ))}
              </div>
            </div>
          )}

          {/* ── 푸터 ── */}
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10,
            color:"#9ca3af", borderTop:"1px solid #e5e7eb", paddingTop:8, marginTop:4 }}>
            <span>배관사무소</span>
            <span>발행일: {fmt.date(new Date().toISOString())}</span>
          </div>
        </div>
        {imgUrl&&(
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
            <img src={imgUrl} alt="보고서" style={{ width:"100%", borderRadius:8 }} />
          </div>
        )}
        {!imgUrl?(
          <button style={{ ...S.btnPrimary, opacity:generating?0.6:1 }} onClick={handleGenerateImage} disabled={generating}>
            {generating?"⏳ 이미지 생성 중...":"🖼 이미지로 변환"}
          </button>
        ):(
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...S.btnSecondary, flex:1 }} onClick={()=>setImgUrl(null)}>다시 생성</button>
            <button style={{ ...S.btnPrimary, flex:2 }} onClick={handleShare}>📤 카카오톡으로 전송</button>
          </div>
        )}
        <div style={{ fontSize:11, color:C.text4, marginTop:8, textAlign:"center" }}>이미지 변환 후 카카오톡 파일 전송으로 공유됩니다</div>
      </div>
    </div>
  );
}

// ── 작업 상세 모달 ────────────────────────────────────────────
function WorkDetailModal({ work, onClose, onEdit, onDeleted }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const netAmount = work.netAmount || work.amount;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      for (const f of (work.files||[])) { try { await deleteObject(ref(storage,f.path)); } catch(e){} }
      await deleteDoc(doc(db,"works",work.id));
      onDeleted(); onClose();
    } catch(e) { alert("삭제 오류: "+e.message); setDeleting(false); }
  };

  return (
    <>
      <div style={S.overlay} onClick={onClose}>
        <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>작업 상세</div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
          </div>
          <div style={S.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:12, color:C.text3, marginBottom:2 }}>발주업체</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{work.clientCompany}</div>
              </div>
              <span style={S.badge(PAY_COLOR[work.payment]||C.text3)}>{PAY_LABEL[work.payment]}</span>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:13, color:C.text3 }}>청구금액 <span style={{ color:C.text }}>{fmt.money(work.amount)}</span></div>
              {work.feeRate>0&&<div style={{ fontSize:12, color:C.red }}>수수료 {work.feeRate}% - {fmt.money(work.feeAmount)}</div>}
              <div style={{ fontSize:24, fontWeight:800, color:C.green, marginTop:4 }}>실수령 {fmt.money(netAmount)}</div>
            </div>
            <div style={S.divider} />
            {[["📅 날짜",fmt.date(work.date)],["📍 시공장소",work.location],
              ["👷 작업자",`${work.workerName} · ${fmt.phone(work.workerPhone)}`],
              ["🏢 작업자 업체",work.workerCompany],
              ["🛠 사용장비",(work.equipment||[]).join(", ")],["⏱ 작업시간",work.workHours],
            ].map(([k,v])=>v?(
              <div key={k} style={{ display:"flex", gap:8, marginBottom:5 }}>
                <span style={{ fontSize:12, color:C.text3, minWidth:90 }}>{k}</span>
                <span style={{ fontSize:12, color:C.text }}>{v}</span>
              </div>
            ):null)}
          </div>
          {work.content&&<div style={S.card}><div style={S.cardTitle}>시공 내용</div><div style={{ fontSize:13,color:C.text,lineHeight:1.7 }}>{work.content}</div></div>}
          {(work.files||[]).length>0&&<div style={S.card}><div style={S.cardTitle}>현장 사진·영상</div><MediaUploader workId={work.id} existingFiles={work.files||[]} readOnly={true} /></div>}
          {work.memo&&<div style={{ ...S.card,border:`1px solid ${C.yellow}30` }}><div style={{ fontSize:11,color:C.yellow,fontWeight:700,marginBottom:4 }}>📌 메모</div><div style={{ fontSize:13,color:C.text }}>{work.memo}</div></div>}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button style={{ ...S.btnSmall(C.purple), flex:1 }} onClick={()=>setShowReport(true)}>📋 작업보고서</button>
            <button style={{ ...S.btnSmall(C.blue), flex:1 }} onClick={()=>{ onEdit(work); onClose(); }}>✏️ 수정</button>
          </div>
          <div style={S.divider} />
          {!confirmDelete?(
            <button style={S.btnDanger} onClick={()=>setConfirmDelete(true)}>🗑 삭제</button>
          ):(
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...S.btnSecondary,flex:1 }} onClick={()=>setConfirmDelete(false)}>취소</button>
              <button disabled={deleting} onClick={handleDelete}
                style={{ flex:1,padding:"11px",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:12,color:C.red,fontSize:14,fontWeight:700,cursor:"pointer" }}>
                {deleting?"삭제 중...":"삭제 확인"}
              </button>
            </div>
          )}
        </div>
      </div>
      {showReport&&<ReportModal work={work} onClose={()=>setShowReport(false)} />}
    </>
  );
}

// ── 날짜 유틸 ─────────────────────────────────────────────────
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일
  const mon = new Date(d); mon.setDate(d.getDate() - (day===0?6:day-1));
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  const pad = (n)=>String(n).padStart(2,"0");
  return {
    start:`${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`,
    end:`${sun.getFullYear()}-${pad(sun.getMonth()+1)}-${pad(sun.getDate())}`,
    label:`${mon.getMonth()+1}/${mon.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`
  };
}

function getWeeksInMonth(yearMonth) {
  const [y,m] = yearMonth.split("-").map(Number);
  const firstDay = new Date(y,m-1,1);
  const lastDay = new Date(y,m,0);
  const weeks = [];
  let cur = new Date(firstDay);
  const startDay = cur.getDay();
  if (startDay!==1) cur.setDate(cur.getDate()-(startDay===0?6:startDay-1));
  while (cur<=lastDay) {
    const mon = new Date(cur);
    const sun = new Date(cur); sun.setDate(cur.getDate()+6);
    const pad=(n)=>String(n).padStart(2,"0");
    weeks.push({
      start:`${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`,
      end:`${sun.getFullYear()}-${pad(sun.getMonth()+1)}-${pad(sun.getDate())}`,
      label:`${mon.getMonth()+1}/${mon.getDate()}~${sun.getMonth()+1}/${sun.getDate()}`
    });
    cur.setDate(cur.getDate()+7);
  }
  return weeks;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function WorkList({ works, profile }) {
  const [viewMode, setViewMode] = useState("month"); // month | week | day
  const [filterMonth, setFilterMonth] = useState(fmt.today().slice(0,7));
  const [filterWeek, setFilterWeek] = useState(()=>getWeekRange(new Date()).start);
  const [filterDay, setFilterDay] = useState(fmt.today());
  const [filterPay, setFilterPay] = useState("");
  const [filterWorker, setFilterWorker] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // 날짜 필터링
  const dateFiltered = works.filter(w=>{
    if (viewMode==="month") return w.date?.startsWith(filterMonth);
    if (viewMode==="week") {
      const week = getWeekRange(new Date(filterWeek+"T00:00:00"));
      return w.date>=week.start && w.date<=week.end;
    }
    if (viewMode==="day") return w.date===filterDay;
    return true;
  });

  // 검색·결제·작업자 필터
  const filtered = dateFiltered.filter(w=>{
    const s = search.toLowerCase();
    const matchS = !s||[w.clientCompany,w.location,w.content,w.workerName,w.workerCompany,(w.equipment||[]).join(",")].some(v=>v?.toLowerCase().includes(s));
    const matchP = !filterPay||w.payment===filterPay;
    const matchW = !filterWorker||w.workerName===filterWorker;
    return matchS&&matchP&&matchW;
  });

  // 집계
  const total  = filtered.reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const cash   = filtered.filter(w=>w.payment==="cash").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const card   = filtered.filter(w=>w.payment==="card").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const credit = filtered.filter(w=>w.payment==="credit").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);

  // 작업자 목록
  const workers = [...new Set(works.map(w=>w.workerName).filter(Boolean))];

  // 주별 목록 (월 선택 시)
  const weeksInMonth = viewMode==="week" ? getWeeksInMonth(filterMonth) : [];
  const currentWeek = viewMode==="week" ? getWeekRange(new Date(filterWeek+"T00:00:00")) : null;

  // 일별 — 선택 월의 날짜 목록
  const daysInMonth = viewMode==="day" ? (() => {
    const [y,m] = filterMonth.split("-").map(Number);
    const days = [];
    const total = new Date(y,m,0).getDate();
    for (let d=1;d<=total;d++) days.push(`${filterMonth}-${String(d).padStart(2,"0")}`);
    return days;
  })() : [];

  // 주별 차트 데이터 (월별 보기 시)
  const weeklyData = viewMode==="month" ? getWeeksInMonth(filterMonth).map(wk=>{
    const wTotal = works.filter(w=>w.date>=wk.start&&w.date<=wk.end)
      .reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
    return { label:wk.label, total:wTotal };
  }) : [];
  const maxWeekly = Math.max(...weeklyData.map(w=>w.total),1);

  // 일별 차트 데이터 (주별 보기 시)
  const DAY_LABELS = ["월","화","수","목","금","토","일"];
  const dailyData = viewMode==="week" && currentWeek ? Array.from({length:7},(_,i)=>{
    const d = new Date(currentWeek.start+"T00:00:00");
    d.setDate(d.getDate()+i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const dayTotal = works.filter(w=>w.date===dateStr).reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
    return { label:DAY_LABELS[i], date:dateStr, total:dayTotal };
  }) : [];
  const maxDaily = Math.max(...dailyData.map(d=>d.total),1);

  if (editTarget) {
    return <WorkForm profile={profile} editWork={editTarget}
      onSaved={()=>setEditTarget(null)} onCancel={()=>setEditTarget(null)} />;
  }

  return (
    <div style={S.content}>
      <div style={S.sectionTitle}>매출 일지</div>

      {/* 조회 기간 탭 */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["month","📅 월별"],["week","📆 주별"],["day","🗓 일별"]].map(([v,l])=>(
          <button key={v} onClick={()=>setViewMode(v)}
            style={{ flex:1, padding:"8px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:"1px solid",
              background:viewMode===v?`${C.blue}25`:"rgba(255,255,255,0.04)",
              borderColor:viewMode===v?C.blue:C.border, color:viewMode===v?C.blue:C.text3 }}>
            {l}
          </button>
        ))}
      </div>

      {/* 날짜 선택 */}
      <div style={{ marginBottom:12 }}>
        {/* 공통: 월 선택 */}
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
          <input type="month" style={{ ...S.searchInput, flex:1 }}
            value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
          {viewMode==="day" && (
            <input type="date" style={{ ...S.searchInput, flex:1 }}
              value={filterDay} onChange={e=>setFilterDay(e.target.value)} />
          )}
        </div>

        {/* 주별: 해당 월의 주 목록 버튼 */}
        {viewMode==="week" && (
          <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
            {getWeeksInMonth(filterMonth).map((wk,i)=>(
              <button key={i} onClick={()=>setFilterWeek(wk.start)}
                style={{ padding:"6px 10px", borderRadius:8, fontSize:11, cursor:"pointer",
                  whiteSpace:"nowrap", border:"1px solid", fontWeight:700,
                  background:filterWeek===wk.start?`${C.blue}25`:"rgba(255,255,255,0.04)",
                  borderColor:filterWeek===wk.start?C.blue:C.border,
                  color:filterWeek===wk.start?C.blue:C.text3 }}>
                {wk.label}
              </button>
            ))}
          </div>
        )}

        {/* 일별: 해당 월의 날짜 버튼 */}
        {viewMode==="day" && (
          <div style={{ display:"flex", gap:4, overflowX:"auto", paddingBottom:4 }}>
            {daysInMonth.map(d=>{
              const dayWorks = works.filter(w=>w.date===d);
              const hasWork = dayWorks.length>0;
              return (
                <button key={d} onClick={()=>setFilterDay(d)}
                  style={{ padding:"6px 8px", borderRadius:8, fontSize:11, cursor:"pointer",
                    whiteSpace:"nowrap", border:"1px solid", fontWeight:700, minWidth:36,
                    background:filterDay===d?`${C.blue}25`:hasWork?"rgba(16,185,129,0.08)":"rgba(255,255,255,0.03)",
                    borderColor:filterDay===d?C.blue:hasWork?`${C.green}40`:C.border,
                    color:filterDay===d?C.blue:hasWork?C.green:C.text4 }}>
                  {Number(d.split("-")[2])}
                  {hasWork&&<div style={{ fontSize:8, color:C.green }}>●</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 주별 차트 (월별 보기 시) */}
      {viewMode==="month" && weeklyData.length>0 && (
        <div style={{ ...S.card, marginBottom:12 }}>
          <div style={S.cardTitle}>주별 매출</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:70 }}>
            {weeklyData.map((wk,i)=>(
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div style={{ fontSize:8, color:C.text4 }}>{wk.total>0?`${Math.round(wk.total/10000)}만`:""}</div>
                <div style={{ width:"100%", background:C.blue, borderRadius:"3px 3px 0 0", opacity:0.7+i*0.05,
                  height:`${Math.max((wk.total/maxWeekly)*55,2)}px`, transition:"height 0.5s" }} />
                <div style={{ fontSize:9, color:C.text4, textAlign:"center" }}>{wk.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 일별 차트 (주별 보기 시) */}
      {viewMode==="week" && dailyData.length>0 && (
        <div style={{ ...S.card, marginBottom:12 }}>
          <div style={S.cardTitle}>
            {currentWeek?.label} 일별 매출
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:70 }}>
            {dailyData.map((d,i)=>(
              <div key={i} onClick={()=>{ setViewMode("day"); setFilterDay(d.date); }}
                style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer" }}>
                <div style={{ fontSize:8, color:C.text4 }}>{d.total>0?`${Math.round(d.total/10000)}만`:""}</div>
                <div style={{ width:"100%", background:d.total>0?C.blue:"rgba(255,255,255,0.06)",
                  borderRadius:"3px 3px 0 0", height:`${Math.max((d.total/maxDaily)*55,2)}px`, transition:"height 0.5s" }} />
                <div style={{ fontSize:10, color:i>=5?C.red:C.text3 }}>{d.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:C.text4, marginTop:6, textAlign:"center" }}>막대 탭 시 해당 날짜 일별 조회</div>
        </div>
      )}

      {/* 검색 필터 */}
      <div style={S.searchRow}>
        <input style={S.searchInput} placeholder="🔍 발주업체·장소·작업자·장비"
          value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.searchInput, flex:"0 0 auto" }} value={filterPay} onChange={e=>setFilterPay(e.target.value)}>
          <option value="">전체</option><option value="cash">현금</option>
          <option value="card">카드</option><option value="credit">외상</option>
        </select>
        {workers.length>1&&(
          <select style={{ ...S.searchInput, flex:"0 0 auto" }} value={filterWorker} onChange={e=>setFilterWorker(e.target.value)}>
            <option value="">전체 작업자</option>
            {workers.map(w=><option key={w} value={w}>{w}</option>)}
          </select>
        )}
      </div>

      {/* 합계 */}
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontSize:12, color:C.text3 }}>
            {viewMode==="month"&&filterMonth&&`${filterMonth.slice(0,4)}년 ${Number(filterMonth.slice(5,7))}월`}
            {viewMode==="week"&&currentWeek&&currentWeek.label}
            {viewMode==="day"&&filterDay&&fmt.date(filterDay)}
            {" · "}{filtered.length}건 · 수수료 제외
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:C.green }}>{fmt.money(total)}</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          {[["현금",cash,C.green],["카드",card,C.blue],["외상",credit,C.yellow]].map(([l,v,c])=>(
            <div key={l} style={{ flex:1, textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.text3 }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:700, color:c }}>{fmt.money(v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 작업 목록 */}
      {filtered.map(w=>(
        <div key={w.id} style={S.listItem} onClick={()=>setSelected(w)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{w.clientCompany}</span>
                <span style={S.badge(PAY_COLOR[w.payment]||C.text3)}>{PAY_LABEL[w.payment]}</span>
                {w.feeRate>0&&<span style={S.badge(C.red)}>수수료 {w.feeRate}%</span>}
              </div>
              <div style={{ fontSize:11, color:C.text3 }}>{fmt.date(w.date)} · {w.location}</div>
              <div style={{ fontSize:11, color:C.text4, marginTop:1 }}>
                👷 {w.workerName} ({w.workerCompany})
                {(w.files||[]).length>0&&<span style={{ marginLeft:8 }}>📷{(w.files||[]).length}</span>}
              </div>
              {w.workHours&&<div style={{ fontSize:10, color:C.text4 }}>⏱ {w.workHours}</div>}
              {(w.equipment||[]).length>0&&<div style={{ fontSize:10, color:C.text4 }}>🛠 {w.equipment.join(" · ")}</div>}
            </div>
            <div style={{ textAlign:"right", marginLeft:8 }}>
              {w.feeRate>0&&<div style={{ fontSize:10, color:C.text3, textDecoration:"line-through" }}>{fmt.money(w.amount)}</div>}
              <div style={{ fontSize:16, fontWeight:800, color:C.green }}>{fmt.money(w.netAmount||w.amount)}</div>
            </div>
          </div>
          {w.memo&&<div style={{ marginTop:6, fontSize:11, color:C.yellow }}>📌 {w.memo}</div>}
        </div>
      ))}
      {filtered.length===0&&(
        <div style={{ color:C.text4, textAlign:"center", padding:32, fontSize:13 }}>
          {viewMode==="day"?`${fmt.date(filterDay)} 작업 내역이 없습니다`:
           viewMode==="week"?"해당 주 작업 내역이 없습니다":"조회된 매출이 없습니다"}
        </div>
      )}

      {selected&&<WorkDetailModal work={selected} onClose={()=>setSelected(null)}
        onEdit={w=>{ setEditTarget(w); setSelected(null); }} onDeleted={()=>setSelected(null)} />}
    </div>
  );
}
