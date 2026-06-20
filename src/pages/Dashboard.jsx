import { useState, useRef } from "react";
import { S, C, fmt, PAY_COLOR, PAY_LABEL } from "../styles/theme";
import { doc, deleteDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import MediaUploader from "../components/MediaUploader";

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
    } catch(e) {
      if (e.name !== "AbortError") {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = `작업보고서_${work.date}.jpg`; a.click();
      }
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>작업보고서</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        {/* 보고서 미리보기 */}
        <div ref={reportRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:20, fontSize:12, marginBottom:14, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
          {/* 헤더 */}
          <div style={{ textAlign:"center", marginBottom:14 }}>
            <div style={{ fontSize:24, fontWeight:900, letterSpacing:6, color:"#1f2937", marginBottom:3 }}>작 업 보 고 서</div>
            <div style={{ fontSize:11, color:"#6b7280" }}>배관사무소</div>
            <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
          </div>
          {/* 수신/발신 */}
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
                  {work.workerName}{work.workerCompany?` (${work.workerCompany})`:""}
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
          {/* 시공내용 */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
            <div style={{ background:"#374151", padding:"6px 12px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>시 공 내 용</span>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <tbody>
                {[["시공장소",work.location],["시공내용",work.content],
                  ["사용장비",(work.equipment||[]).join(", ")],["작업시간",work.workHours]
                ].map(([k,v],i)=>v?(
                  <tr key={k} style={{ background:i%2===0?"#fff":"#f8fafc" }}>
                    <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>{k}</td>
                    <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{v}</td>
                  </tr>
                ):null)}
              </tbody>
            </table>
          </div>
          {/* 결제내역 */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
            <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>결 제 내 역</span>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <tbody>
                <tr style={{ background:"#fff" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>청구금액</td>
                  <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9" }}>{fmt.money(work.amount)}</td>
                </tr>
                <tr style={{ background:"#f8fafc" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", color:"#374151" }}>수수료</td>
                  <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#ef4444" }}>
                    {work.feeRate>0?`${fmt.money(work.feeAmount)} (${work.feeRate}%)`:"면제"}
                  </td>
                </tr>
                <tr style={{ background:"#eff6ff" }}>
                  <td style={{ padding:"8px 12px", fontWeight:800, fontSize:12, borderBottom:"1px solid #dbeafe", color:"#1e3a5f" }}>실수령액</td>
                  <td style={{ padding:"8px 12px", fontSize:15, fontWeight:800, borderBottom:"1px solid #dbeafe", color:"#1d4ed8" }}>{fmt.money(netAmount)}</td>
                </tr>
                <tr style={{ background:"#fff" }}>
                  <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, color:"#374151" }}>결제방식</td>
                  <td style={{ padding:"7px 12px", fontSize:12 }}>{PAY_LABEL[work.payment]}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* 비고 */}
          {work.memo && (
            <div style={{ border:"1px solid #fde68a", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
              <div style={{ background:"#fef3c7", padding:"6px 12px" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#92400e", letterSpacing:1 }}>비 고</span>
              </div>
              <div style={{ padding:"8px 12px", fontSize:12, color:"#1f2937", background:"#fffbeb" }}>{work.memo}</div>
            </div>
          )}
          {/* 현장 사진 */}
          {images.length>0 && (
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
          {/* 푸터 */}
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10,
            color:"#9ca3af", borderTop:"1px solid #e5e7eb", paddingTop:8, marginTop:4 }}>
            <span>배관사무소</span>
            <span>발행일: {fmt.date(new Date().toISOString())}</span>
          </div>
        </div>

        {/* 생성된 이미지 미리보기 */}
        {imgUrl && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
            <img src={imgUrl} alt="보고서" style={{ width:"100%", borderRadius:8 }} />
          </div>
        )}
        {!imgUrl ? (
          <button style={{ ...S.btnPrimary, opacity:generating?0.6:1 }}
            onClick={handleGenerateImage} disabled={generating}>
            {generating ? "⏳ 이미지 생성 중..." : "🖼 이미지로 변환"}
          </button>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...S.btnSecondary, flex:1 }} onClick={()=>setImgUrl(null)}>다시 생성</button>
            <button style={{ ...S.btnPrimary, flex:2 }} onClick={handleShare}>📤 카카오톡으로 전송</button>
          </div>
        )}
        <div style={{ fontSize:11, color:C.text4, marginTop:8, textAlign:"center" }}>
          이미지 변환 후 카카오톡 파일 전송으로 공유됩니다
        </div>
      </div>
    </div>
  );
}

// ── 작업 상세 모달 ────────────────────────────────────────────
function WorkDetailModal({ work, onClose, onDeleted, onEdit }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const netAmount = work.netAmount || work.amount;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      for (const f of (work.files||[])) {
        try { await deleteObject(ref(storage, f.path)); } catch(e) {}
      }
      await deleteDoc(doc(db,"works",work.id));
      onDeleted?.(); onClose();
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
              {work.feeRate>0 && <div style={{ fontSize:12, color:C.red }}>수수료 {work.feeRate}% - {fmt.money(work.feeAmount)}</div>}
              <div style={{ fontSize:24, fontWeight:800, color:C.green, marginTop:4 }}>실수령 {fmt.money(netAmount)}</div>
            </div>
            <div style={S.divider} />
            {[
              ["📅 날짜", fmt.date(work.date)],
              ["📍 시공장소", work.location],
              ["👷 작업자", `${work.workerName} · ${fmt.phone(work.workerPhone)}`],
              ["🏢 작업자 업체", work.workerCompany],
              ["🛠 사용장비", (work.equipment||[]).join(", ")],
              ["⏱ 작업시간", work.workHours],
            ].map(([k,v])=>v?(
              <div key={k} style={{ display:"flex", gap:8, marginBottom:5 }}>
                <span style={{ fontSize:12, color:C.text3, minWidth:90 }}>{k}</span>
                <span style={{ fontSize:12, color:C.text }}>{v}</span>
              </div>
            ):null)}
          </div>

          {work.content && (
            <div style={S.card}>
              <div style={S.cardTitle}>시공 내용</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{work.content}</div>
            </div>
          )}
          {(work.files||[]).length>0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>현장 사진·영상</div>
              <MediaUploader workId={work.id} existingFiles={work.files||[]} readOnly={true} />
            </div>
          )}
          {work.memo && (
            <div style={{ ...S.card, border:`1px solid ${C.yellow}30` }}>
              <div style={{ fontSize:11, color:C.yellow, fontWeight:700, marginBottom:4 }}>📌 메모</div>
              <div style={{ fontSize:13, color:C.text }}>{work.memo}</div>
            </div>
          )}

          {/* 액션 버튼 — WorkList와 동일하게 작업보고서 포함 */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button style={{ ...S.btnSmall(C.purple), flex:1 }}
              onClick={()=>setShowReport(true)}>📋 작업보고서</button>
            <button style={{ ...S.btnSmall(C.blue), flex:1 }}
              onClick={()=>{ onEdit?.(work); onClose(); }}>✏️ 수정</button>
          </div>
          <div style={S.divider} />
          {!confirmDelete ? (
            <button style={S.btnDanger} onClick={()=>setConfirmDelete(true)}>🗑 삭제</button>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...S.btnSecondary, flex:1 }} onClick={()=>setConfirmDelete(false)}>취소</button>
              <button disabled={deleting} onClick={handleDelete}
                style={{ flex:1, padding:"11px", background:"rgba(239,68,68,0.2)",
                  border:"1px solid rgba(239,68,68,0.4)", borderRadius:12,
                  color:C.red, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {deleting ? "삭제 중..." : "삭제 확인"}
              </button>
            </div>
          )}
        </div>
      </div>
      {showReport && <ReportModal work={work} onClose={()=>setShowReport(false)} />}
    </>
  );
}

// ── 대시보드 메인 ─────────────────────────────────────────────
export default function Dashboard({ works, expenses, profile, onTabChange }) {
  const [selectedWork, setSelectedWork] = useState(null);

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const mW = works.filter(w=>fmt.monthKey(w.date)===ym);
  const mE = expenses.filter(e=>fmt.monthKey(e.date)===ym);
  const revenue = mW.reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const expense = mE.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const profit  = revenue - expense;
  const cash    = mW.filter(w=>w.payment==="cash").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const card    = mW.filter(w=>w.payment==="card").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);
  const credit  = mW.filter(w=>w.payment==="credit").reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0);

  const months = Array.from({length:5},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-4+i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    return {
      label:`${d.getMonth()+1}월`,
      total: works.filter(w=>fmt.monthKey(w.date)===key).reduce((s,w)=>s+(Number(w.netAmount||w.amount)||0),0)
    };
  });
  const maxRev = Math.max(...months.map(m=>m.total), 1);

  return (
    <div style={S.content}>
      {/* 인사 */}
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:13, color:C.text3 }}>안녕하세요,</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#fff" }}>{profile.name} 님 👋</div>
        {profile.companyName && <div style={{ fontSize:12, color:C.text4 }}>🏢 {profile.companyName}</div>}
        <div style={{ fontSize:12, color:C.text4, marginTop:2 }}>{fmt.monthLabel(ym)} 현황</div>
      </div>

      {/* 순이익 카드 */}
      <div style={{ background:`linear-gradient(135deg,${C.blueDark},${C.blue})`, borderRadius:18, padding:22, marginBottom:12 }}>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", marginBottom:2 }}>이번달 순이익</div>
        <div style={{ fontSize:34, fontWeight:800, color:"#fff", letterSpacing:"-1px" }}>{fmt.money(profit)}</div>
        <div style={{ height:1, background:"rgba(255,255,255,0.2)", margin:"12px 0" }} />
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
          <div><span style={{ color:"rgba(255,255,255,0.6)" }}>매출 </span><span style={{ color:"#fff", fontWeight:700 }}>{fmt.money(revenue)}</span></div>
          <div><span style={{ color:"rgba(255,255,255,0.6)" }}>지출 </span><span style={{ color:"#fca5a5", fontWeight:700 }}>{fmt.money(expense)}</span></div>
          <div><span style={{ color:"rgba(255,255,255,0.6)" }}>작업 </span><span style={{ color:"#fff", fontWeight:700 }}>{mW.length}건</span></div>
        </div>
      </div>

      {/* 결제수단별 */}
      <div style={S.card}>
        <div style={S.cardTitle}>결제수단별 매출</div>
        {[["💵 현금",cash,C.green],["💳 카드",card,C.blue],["⏳ 외상",credit,C.yellow]].map(([l,v,c])=>(
          <div key={l} style={{ marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:12, color:C.text2 }}>{l}</span>
              <span style={{ fontSize:13, fontWeight:700, color:c }}>{fmt.money(v)}</span>
            </div>
            <div style={{ height:5, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", background:c, borderRadius:3, width:revenue>0?`${(v/revenue)*100}%`:"0%", transition:"width 0.8s" }} />
            </div>
          </div>
        ))}
      </div>

      {/* 월별 차트 */}
      <div style={S.card}>
        <div style={S.cardTitle}>월별 매출 추이</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80 }}>
          {months.map((m,i)=>(
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ fontSize:9, color:i===4?C.blue:C.text4 }}>{m.total>0?`${Math.round(m.total/10000)}만`:""}</div>
              <div style={{ width:"100%", background:i===4?C.blue:"rgba(59,130,246,0.25)", borderRadius:"4px 4px 0 0",
                height:`${Math.max((m.total/maxRev)*60,2)}px`, transition:"height 0.6s" }} />
              <div style={{ fontSize:10, color:i===4?C.text2:C.text4 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 최근 작업 — 클릭 시 상세+보고서 모달 */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.text2 }}>최근 작업</div>
        <button onClick={()=>onTabChange("revenue")}
          style={{ background:"none", border:"none", color:C.blue, fontSize:12, cursor:"pointer" }}>
          전체보기 →
        </button>
      </div>

      {works.slice(0,3).map(w=>(
        <div key={w.id} style={S.listItem} onClick={()=>setSelectedWork(w)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{w.clientCompany}</div>
              <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{fmt.date(w.date)} · {w.location}</div>
              <div style={{ fontSize:11, color:C.text4, marginTop:1 }}>
                👷 {w.workerName} ({w.workerCompany})
                {(w.files||[]).length>0 && <span style={{ marginLeft:6 }}>📷{(w.files||[]).length}</span>}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              {w.feeRate>0 && <div style={{ fontSize:10, color:C.text3, textDecoration:"line-through" }}>{fmt.money(w.amount)}</div>}
              <div style={{ fontSize:15, fontWeight:800, color:C.green }}>{fmt.money(w.netAmount||w.amount)}</div>
              <span style={S.badge(PAY_COLOR[w.payment]||C.text3)}>{PAY_LABEL[w.payment]}</span>
            </div>
          </div>
        </div>
      ))}
      {works.length===0 && (
        <div style={{ color:C.text4, fontSize:13, textAlign:"center", padding:24 }}>작업 기록이 없습니다</div>
      )}

      {/* 작업 상세 + 보고서 모달 */}
      {selectedWork && (
        <WorkDetailModal
          work={selectedWork}
          onClose={()=>setSelectedWork(null)}
          onDeleted={()=>setSelectedWork(null)}
          onEdit={()=>{ setSelectedWork(null); onTabChange("revenue"); }}
        />
      )}
    </div>
  );
}
