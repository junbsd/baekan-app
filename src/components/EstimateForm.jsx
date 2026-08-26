import { useState, useRef, useEffect } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const VALID_DAYS = 3; // 견적 유효기간(일)
const NOTICE_TEXT = "본 견적은 발행일로부터 3일간 유효하며, 이후 방문 시 현장 상태 변화에 따라 금액이 변동될 수 있습니다.";

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// 합계금액(부가세 포함) → 단가(공급가액)/세액 자동 계산
// 단가 = 합계금액 ÷ 1.1 (반올림), 세액 = 합계금액 - 단가
// → 단가 + 세액이 항상 합계금액과 정확히 일치함 (끝수 오차 없음)
const calcSupplyAndTax = (totalAmount) => {
  const total = Number(totalAmount) || 0;
  if (total <= 0) return { supplyAmount: 0, taxAmount: 0 };
  const supplyAmount = Math.round(total / 1.1);
  const taxAmount = total - supplyAmount;
  return { supplyAmount, taxAmount };
};

// 단가(공급가액) → 세액/합계금액 자동 계산
// 세액 = 단가 × 0.1 (반올림), 합계금액 = 단가 + 세액
const calcTaxAndTotal = (supplyAmountInput) => {
  const supply = Number(supplyAmountInput) || 0;
  if (supply <= 0) return { taxAmount: 0, amount: 0 };
  const taxAmount = Math.round(supply * 0.1);
  const amount = supply + taxAmount;
  return { taxAmount, amount };
};

const emptyEstimate = (profile) => {
  const today = fmt.today();
  return {
    date: today,
    validUntil: addDays(today, VALID_DAYS),
    issuedTo: "",
    location: "",
    content: "",
    amount: "",
    supplyAmount: "",       // 단가(공급가액) - 직접 입력 가능, 합계금액에서도 자동 계산됨
    taxAmount: 0,           // 세액(부가세) - 항상 읽기전용, 단가의 10%
    amountSource: "amount", // 마지막으로 사용자가 직접 입력한 기준 필드: "amount"(합계금액) | "supply"(단가)
    payment: "cash",       // cash | card | invoice | other
    paymentCustom: "",
    workerName: profile.name,
    workerCompany: profile.companyName || "",
    workerPhone: profile.phone,
    signatureUrl: profile.signatureUrl || "",
  };
};

const PAY_LABEL_MAP = { cash: "현금", card: "카드", invoice: "청구" };

// ── 견적서 미리보기 (이미지 변환용 마크업 포함) ──────────────
function EstimatePreview({ es, previewRef }) {
  const payLabel = es.payment === "other" ? (es.paymentCustom || "기타") : (PAY_LABEL_MAP[es.payment] || es.payment);
  // 저장된 단가/세액이 있으면 그대로 사용, 없으면(과거 데이터) 합계금액에서 즉석 계산
  const hasStoredBreakdown = es.supplyAmount != null && es.taxAmount != null;
  const { supplyAmount, taxAmount } = hasStoredBreakdown
    ? { supplyAmount: es.supplyAmount, taxAmount: es.taxAmount }
    : calcSupplyAndTax(es.amount);
  return (
    <div ref={previewRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:20,
      fontSize:12, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      {/* 헤더 */}
      <div style={{ textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:24, fontWeight:900, letterSpacing:6, color:"#1f2937", marginBottom:3 }}>견 적 서</div>
        <div style={{ fontSize:11, color:"#6b7280" }}>배관사무소</div>
        <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
      </div>

      {/* 수신/발신/날짜 */}
      <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:6, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>수신</span>
            <span style={{ fontSize:15, fontWeight:800, color:"#1f2937" }}>{es.issuedTo}</span>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{fmt.date(es.date)}</div>
        </div>
        <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
          <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>발신</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>
            {es.workerName}{es.workerCompany ? ` (${es.workerCompany})` : ""}
          </span>
          {es.signatureUrl && (
            <img src={es.signatureUrl} alt="서명" crossOrigin="anonymous"
              style={{ height:28, width:"auto", maxWidth:50, objectFit:"contain" }} />
          )}
        </div>
        {es.workerPhone && (
          <div style={{ fontSize:11, color:"#6b7280", marginTop:4, marginLeft:34 }}>{fmt.phone(es.workerPhone)}</div>
        )}
      </div>

      {/* 견적 내용 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        <div style={{ background:"#374151", padding:"6px 12px" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>견 적 내 용</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            {[["장소", es.location]].map(([k,v], i) => v ? (
              <tr key={k} style={{ background: i%2===0?"#fff":"#f8fafc" }}>
                <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>{k}</td>
                <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{v}</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
        {es.content && (
          <div style={{ padding:"10px 12px", fontSize:12, color:"#1f2937", lineHeight:1.7, whiteSpace:"pre-wrap", borderTop:"1px solid #f1f5f9" }}>
            {es.content}
          </div>
        )}
      </div>

      {/* 견적금액 / 결제방식 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>견 적 금 액</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff" }}>
          <tbody>
            <tr>
              <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>단가</td>
              <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937", textAlign:"right" }}>{fmt.money(supplyAmount)}</td>
            </tr>
            <tr>
              <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", color:"#374151" }}>세액</td>
              <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937", textAlign:"right" }}>{fmt.money(taxAmount)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding:"14px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#fff", borderTop:"1px solid #e5e7eb" }}>
          <div>
            <div style={{ fontSize:10, color:"#6b7280", marginBottom:2 }}>합계금액</div>
            <span style={{ fontSize:20, fontWeight:900, color:"#1e3a5f" }}>{fmt.money(es.amount)}</span>
          </div>
          <span style={{ fontSize:12, color:"#6b7280" }}>결제방식: {payLabel}</span>
        </div>
      </div>

      {/* 유효기간 안내 */}
      <div style={{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:6, padding:"10px 12px", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#92400e", marginBottom:4 }}>
          ⏰ 견적 유효기간: {fmt.date(es.date)} ~ {fmt.date(es.validUntil)}
        </div>
        <div style={{ fontSize:11, color:"#92400e", lineHeight:1.6 }}>{NOTICE_TEXT}</div>
      </div>

      {/* 발행일 */}
      <div style={{ textAlign:"right", fontSize:10, color:"#9ca3af", marginTop:14 }}>
        발행일: {fmt.date(new Date().toISOString())}
      </div>
    </div>
  );
}

// ── 견적서 작성/보기 메인 ─────────────────────────────────────
export default function EstimateForm({ profile, onBack, userRole, userTeamId, isAdmin }) {
  const [estimates, setEstimates] = useState([]);
  const [view, setView] = useState("list"); // list | edit | detail
  const [target, setTarget] = useState(null); // 선택된/작성중인 견적서
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const previewRef = useRef();

  // 역할별 견적서 분리:
  // - admin: 전체 조회(최고관리자만 예외)
  // - team / shared: 같은 팀(teamId)끼리만 공유
  //   ("공유(shared)" 역할도 teamId가 있으면 team과 동일하게 그 팀끼리만 데이터를 공유한다.
  //    예전에는 shared가 무조건 전체 조회였는데, 다른 개인/팀 사용자의 데이터까지 보이는
  //    심각한 분리 버그가 있었음 — 이제는 shared/team 모두 teamId 기준으로 동일하게 분리됨)
  // - private(개인): 본인이 작성한 견적서만(createdByUid 우선, 과거 데이터는 workerName 보조 매칭)
  useEffect(() => {
    let q;
    const hasTeamFilter = (userRole === "team" || userRole === "shared") && !!userTeamId;
    if (isAdmin) {
      q = query(collection(db, "estimates"), orderBy("date", "desc"));
      return onSnapshot(q, snap => setEstimates(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    } else if (hasTeamFilter) {
      q = query(collection(db, "estimates"), where("teamId", "==", userTeamId));
    } else {
      q = query(collection(db, "estimates"));
    }
    return onSnapshot(q, snap => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (hasTeamFilter) {
        // teamId where는 이미 서버에서 필터링됨 (위에서 쿼리에 포함)
      } else if (!isAdmin) {
        // private이거나, team/shared인데 아직 teamId가 지정되지 않은 경우(콘솔 마이그레이션 전) 모두
        // 안전하게 본인 데이터만 보도록 클라이언트에서 한 번 더 필터링한다.
        // (teamId 미지정 상태에서 전체를 보여주면 다른 사람 데이터가 새는 위험한 버그가 되므로,
        //  "아직 아무것도 안 보임"이 "남의 데이터가 다 보임"보다 항상 안전하다.)
        list = list.filter(es =>
          (profile?.uid && es.createdByUid === profile.uid) ||
          (!es.createdByUid && es.workerName === profile?.name)
        );
      }
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setEstimates(list);
    });
  }, [userRole, userTeamId, profile?.uid, profile?.name, isAdmin]);

  const openNew = () => { setTarget(emptyEstimate(profile)); setView("edit"); };
  const openDetail = (es) => { setTarget(es); setView("detail"); };
  // 수정 화면을 열 때, 원래 작성자 정보를 보존(originalWorker)하면서
  // writerMode("original" | "current")로 누구 정보를 적용할지 선택할 수 있게 한다.
  // 기본값은 "original"(기존 작성자 유지) — 의도치 않은 정보 변경을 막기 위한 안전한 기본값.
  const openEdit = (es) => {
    // 과거에 저장된 견적서 중 supplyAmount/taxAmount가 없는 데이터(이 기능 추가 전 작성분)도
    // 수정 화면에 들어가는 즉시 합계금액 기준으로 계산해 채워준다.
    const { supplyAmount, taxAmount } = calcSupplyAndTax(es.amount);
    const originalWorker = {
      workerName: es.workerName,
      workerCompany: es.workerCompany || "",
      workerPhone: es.workerPhone,
      signatureUrl: es.signatureUrl || "",
    };
    setTarget({
      ...es,
      supplyAmount: es.supplyAmount != null ? es.supplyAmount : supplyAmount,
      taxAmount: es.taxAmount != null ? es.taxAmount : taxAmount,
      amountSource: es.amountSource || "amount", // 과거 데이터는 합계금액 기준으로 간주
      writerMode: "original",
      originalWorker,
      ...originalWorker, // 기본값: 기존 작성자 정보 그대로 표시
    });
    setView("edit");
  };

  // 토글 전환: "기존 작성자 유지" <-> "현재 로그인 계정으로 변경"
  const setWriterMode = (mode) => setTarget(t => {
    if (!t.originalWorker) return t; // 새 견적서 작성 중에는 토글이 없으므로 안전 처리
    const worker = mode === "current"
      ? { workerName: profile.name, workerCompany: profile.companyName || "", workerPhone: profile.phone, signatureUrl: profile.signatureUrl || "" }
      : t.originalWorker;
    return { ...t, writerMode: mode, ...worker };
  });

  const set = (k, v) => setTarget(t => {
    const next = { ...t, [k]: v };
    if (k === "date") next.validUntil = addDays(v, VALID_DAYS);
    if (k === "amount") {
      // 합계금액을 기준으로 단가/세액 재계산
      next.amountSource = "amount";
      const { supplyAmount, taxAmount } = calcSupplyAndTax(v);
      next.supplyAmount = supplyAmount;
      next.taxAmount = taxAmount;
    }
    if (k === "supplyAmount") {
      // 단가를 기준으로 세액/합계금액 재계산
      next.amountSource = "supply";
      const { taxAmount, amount } = calcTaxAndTotal(v);
      next.taxAmount = taxAmount;
      next.amount = amount;
    }
    return next;
  });

  const handleSave = async () => {
    if (!target.issuedTo.trim()) { alert("수신을 입력해주세요."); return; }
    if (!target.location.trim()) { alert("장소를 입력해주세요."); return; }
    if (!target.amount) { alert("단가 또는 합계금액을 입력해주세요."); return; }
    if (target.payment === "other" && !target.paymentCustom.trim()) { alert("결제방식(기타)을 입력해주세요."); return; }
    setSaving(true);
    try {
      // amountSource(마지막으로 사용자가 직접 입력한 기준)에 따라 올바른 방향으로 최종 계산
      // - "supply"(단가 기준): 단가 -> 세액/합계금액 계산
      // - "amount"(합계금액 기준, 기본값): 합계금액 -> 단가/세액 계산
      let finalAmount, finalSupply, finalTax;
      if (target.amountSource === "supply") {
        const { taxAmount, amount } = calcTaxAndTotal(target.supplyAmount);
        finalSupply = Number(target.supplyAmount) || 0;
        finalTax = taxAmount;
        finalAmount = amount;
      } else {
        const { supplyAmount, taxAmount } = calcSupplyAndTax(target.amount);
        finalAmount = Number(target.amount) || 0;
        finalSupply = supplyAmount;
        finalTax = taxAmount;
      }
      // writerMode/originalWorker는 화면에서 토글 선택을 위한 임시 상태일 뿐이므로 저장 데이터에서 제외하고,
      // 실제로 화면에 적용된(선택된) workerName/workerPhone 등의 값만 저장한다.
      const { writerMode, originalWorker, ...rest } = target;
      const data = { ...rest, amount: finalAmount, supplyAmount: finalSupply, taxAmount: finalTax, updatedAt: new Date().toISOString() };
      if (target.id) {
        // 작성자 귀속 정보(teamId/createdByUid)는 최초 작성자 기준으로 유지 - 수정 시 덮어쓰지 않음
        await updateDoc(doc(db, "estimates", target.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        data.teamId = userTeamId || null;
        data.createdByUid = profile.uid; // 개인(private) 사용자 데이터 분리를 위해 작성자 uid 기록
        await addDoc(collection(db, "estimates"), data);
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); setView("list"); setTarget(null); }, 1200);
    } catch (e) {
      alert("저장 중 오류: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("이 견적서를 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "estimates", target.id));
      setView("list"); setTarget(null);
    } catch (e) {
      alert("삭제 오류: " + e.message);
    }
  };

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
      const canvas = await window.html2canvas(previewRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
      setImgUrl(canvas.toDataURL("image/jpeg", 0.92));
    } catch (e) { alert("이미지 생성 중 오류가 발생했습니다."); }
    setGenerating(false);
  };

  const handleShare = async () => {
    if (!imgUrl) return;
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], `견적서_${target.issuedTo || "현장"}_${target.date}.jpg`, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "견적서", files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = file.name; a.click();
        alert("이미지가 저장됐습니다. 카카오톡에서 파일 첨부로 전송해주세요.");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = `견적서_${target.date}.jpg`; a.click();
      }
    }
  };

  const goBackToList = () => { setView("list"); setTarget(null); setImgUrl(null); setShowImagePreview(false); };

  // ── 이미지 변환 화면 ──
  if (showImagePreview && target) {
    return (
      <div style={S.content}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={()=>setShowImagePreview(false)} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
          <div style={S.sectionTitle}>견적서 이미지 변환</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <EstimatePreview es={target} previewRef={previewRef} />
        </div>
        {imgUrl && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
            <img src={imgUrl} alt="견적서" style={{ width:"100%", borderRadius:8 }} />
          </div>
        )}
        {!imgUrl ? (
          <button style={{ ...S.btnPrimary, opacity: generating ? 0.6 : 1 }} onClick={handleGenerateImage} disabled={generating}>
            {generating ? "⏳ 이미지 생성 중..." : "🖼 이미지로 변환"}
          </button>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...S.btnSecondary, flex:1 }} onClick={() => setImgUrl(null)}>다시 생성</button>
            <button style={{ ...S.btnPrimary, flex:2 }} onClick={handleShare}>📤 카카오톡으로 전송</button>
          </div>
        )}
      </div>
    );
  }

  // ── 목록 화면 ──
  if (view === "list") {
    return (
      <div style={S.content}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          {onBack && <button onClick={onBack} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>}
          <div style={S.sectionTitle}>견적서</div>
        </div>
        <button style={{ ...S.btnPrimary, marginBottom:14 }} onClick={openNew}>📋 새 견적서 작성</button>
        {estimates.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0", color:C.text4, fontSize:13 }}>
            작성된 견적서가 없습니다.
          </div>
        )}
        {estimates.map(es => (
          <div key={es.id} style={S.listItem} onClick={() => openDetail(es)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{es.issuedTo || "(수신 미입력)"}</div>
                <div style={{ fontSize:11, color:C.text3, marginTop:3 }}>
                  {fmt.date(es.date)} · {es.location || "장소 미입력"}
                </div>
                <div style={{ fontSize:13, color:C.green, marginTop:3, fontWeight:700 }}>{fmt.money(es.amount)}</div>
              </div>
              <span style={{ color:C.text3 }}>→</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── 상세 보기 화면 ──
  if (view === "detail" && target) {
    return (
      <div style={S.content}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={goBackToList} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
          <div style={S.sectionTitle}>견적서</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <EstimatePreview es={target} previewRef={previewRef} />
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <button style={{ ...S.btnSmall(C.purple), flex:1 }} onClick={() => setShowImagePreview(true)}>🖼 이미지 변환</button>
          <button style={{ ...S.btnSmall(C.blue), flex:1 }} onClick={() => openEdit(target)}>✏️ 수정</button>
        </div>
        <button style={S.btnDanger} onClick={handleDelete}>🗑 삭제</button>
      </div>
    );
  }

  // ── 작성/수정 화면 ──
  return (
    <div style={S.content}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={goBackToList} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
        <div style={S.sectionTitle}>{target.id ? "견적서 수정" : "견적서 작성"}</div>
      </div>
      {saved && <div style={S.toast(true)}>✅ 저장되었습니다!</div>}

      {/* 수신/날짜 */}
      <div style={S.card}>
        <div style={S.cardTitle}>기본 정보</div>
        <div style={S.fg}>
          <label style={S.label}>수신 *</label>
          <input style={S.input} placeholder="예: 홍길동님, OO공인중개사 등" value={target.issuedTo}
            onChange={e => set("issuedTo", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>날짜</label>
          <input type="date" style={S.input} value={target.date} onChange={e => set("date", e.target.value)} />
          <div style={{ fontSize:11, color:C.text4, marginTop:4 }}>
            견적 유효기간: {fmt.date(target.date)} ~ {fmt.date(target.validUntil)} (발행일+3일)
          </div>
        </div>
        <div style={S.fg}>
          <label style={S.label}>장소 *</label>
          <input style={S.input} placeholder="시공 장소 주소" value={target.location}
            onChange={e => set("location", e.target.value)} />
        </div>
      </div>

      {/* 발신 정보 (읽기전용 + 서명 미리보기) */}
      <div style={S.card}>
        <div style={S.cardTitle}>발신 정보</div>

        {/* 수정 시에만: 기존 작성자 유지 / 현재 로그인 계정으로 변경 토글
            (단, 원작성자와 현재 로그인 계정이 같은 사람이면 토글이 의미 없으므로 숨김) */}
        {target.originalWorker && target.originalWorker.workerPhone !== profile.phone && (
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background:"rgba(255,255,255,0.03)", border:`1px solid ${C.border}`,
            borderRadius:12, padding:"10px 12px", marginBottom:12,
          }}>
            <div style={{ flex:1, marginRight:10 }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:C.text }}>
                {target.writerMode === "current" ? "현재 로그인 계정으로 변경" : "기존 작성자 유지"}
              </div>
              <div style={{ fontSize:11, color:C.text4, marginTop:2 }}>
                {target.writerMode === "current" ? "내 정보로 발신 정보가 바뀝니다" : "원래 작성자 정보가 그대로 유지됩니다"}
              </div>
            </div>
            {/* iOS 스타일 슬라이딩 토글 */}
            <button
              role="switch"
              aria-checked={target.writerMode === "current"}
              onClick={() => setWriterMode(target.writerMode === "current" ? "original" : "current")}
              style={{
                position:"relative", width:50, height:28, borderRadius:14, border:"none", cursor:"pointer",
                background: target.writerMode === "current" ? C.blue : "rgba(255,255,255,0.16)",
                transition:"background 0.2s ease", flexShrink:0, padding:0,
              }}
            >
              <span style={{
                position:"absolute", top:3, left: target.writerMode === "current" ? 25 : 3,
                width:22, height:22, borderRadius:"50%", background:"#fff",
                boxShadow:"0 1px 3px rgba(0,0,0,0.4)", transition:"left 0.2s ease",
              }} />
            </button>
          </div>
        )}

        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:C.text, fontWeight:700 }}>
              {target.workerName}{target.workerCompany ? ` (${target.workerCompany})` : ""}
            </div>
            <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>{fmt.phone(target.workerPhone)}</div>
          </div>
          {target.signatureUrl ? (
            <div style={{ background:"#fff", borderRadius:8, padding:6 }}>
              <img src={target.signatureUrl} alt="서명" style={{ height:36, width:"auto", maxWidth:60, objectFit:"contain" }} />
            </div>
          ) : (
            <div style={{ fontSize:11, color:C.text4 }}>설정에서 서명을 등록하세요</div>
          )}
        </div>
      </div>

      {/* 견적 내용 */}
      <div style={S.card}>
        <div style={S.cardTitle}>견적 내용</div>
        <div style={S.fg}>
          <label style={S.label}>내용</label>
          <textarea style={S.textarea} placeholder="견적 내용을 입력하세요"
            value={target.content} onChange={e => set("content", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>단가(공급가액)</label>
          <input type="number" inputMode="numeric" style={S.input} placeholder="0" value={target.supplyAmount}
            onChange={e => set("supplyAmount", e.target.value)} />
          {target.supplyAmount > 0 && <div style={{ fontSize:12, color:C.text3, marginTop:4 }}>{fmt.money(target.supplyAmount)}</div>}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <div style={{ flex:1, background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:11, color:C.text4, marginBottom:3 }}>세액(부가세, 단가의 10%)</div>
            <div style={{ fontSize:14, color:C.text, fontWeight:700 }}>{fmt.money(target.taxAmount)}</div>
          </div>
        </div>

        <div style={S.fg}>
          <label style={S.label}>합계금액(부가세 포함) *</label>
          <input type="number" inputMode="numeric" style={S.input} placeholder="0" value={target.amount}
            onChange={e => set("amount", e.target.value)} />
          {target.amount > 0 && <div style={{ fontSize:13, color:C.green, marginTop:4, fontWeight:700 }}>{fmt.money(target.amount)}</div>}
        </div>

        <div style={{ fontSize:11, color:C.text4, marginTop:6 }}>
          ℹ️ 단가 또는 합계금액 중 하나를 입력하면 나머지(세액 포함)가 자동으로 계산됩니다. 세액은 직접 수정할 수 없습니다.
        </div>
      </div>

      {/* 결제 방식 */}
      <div style={S.card}>
        <div style={S.cardTitle}>결제 방식</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {[["cash","💵 현금"],["card","💳 카드"],["invoice","🧾 청구"],["other","✏️ 기타"]].map(([k,l])=>(
            <button key={k} onClick={()=>set("payment",k)}
              style={{ ...S.tagBtn(target.payment===k), padding:"7px 14px", fontSize:13 }}>{l}</button>
          ))}
        </div>
        {target.payment === "other" && (
          <input style={S.input} placeholder="결제방식을 입력하세요 (필수)" value={target.paymentCustom}
            onChange={e => set("paymentCustom", e.target.value)} autoFocus />
        )}
      </div>

      {/* 안내 문구 미리보기 */}
      <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)",
        borderRadius:10, padding:12, marginBottom:16, fontSize:12, color:C.yellow, lineHeight:1.6 }}>
        ℹ️ {NOTICE_TEXT}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button style={{ ...S.btnSecondary, flex:1 }} onClick={goBackToList}>취소</button>
        <button style={{ ...S.btnPrimary, flex:2, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : target.id ? "✏️ 수정 저장" : "💾 견적서 저장"}
        </button>
      </div>
    </div>
  );
}
