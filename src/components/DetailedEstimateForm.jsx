import { useState, useRef, useEffect } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const VALID_DAYS = 3;
const NOTICE_TEXT = "본 견적은 발행일로부터 3일간 유효하며, 이후 방문 시 현장 상태 변화에 따라 금액이 변동될 수 있습니다.";
const MAX_ITEMS = 10;
const UNIT_OPTIONS = ["식", "개", "m", "m²", "EA", "회", "톤", "박스", "인", "공", "일", "시간"];
const PAY_LABEL_MAP = { cash: "현금", card: "카드", invoice: "청구" };

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const emptyItem = () => ({ name: "", spec: "", qty: "", unit: "식", unitPrice: "" });

// 품목 1건의 공급가액 = 수량 x 단가 (반올림)
const calcItemAmount = (qty, unitPrice) => {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  return Math.round(q * p);
};

// 전체 품목의 공급가액 합계 -> 세액(10%) -> 총 합계금액
const calcTotals = (items) => {
  const supplyTotal = items.reduce((sum, it) => sum + calcItemAmount(it.qty, it.unitPrice), 0);
  const taxTotal = Math.round(supplyTotal * 0.1);
  const grandTotal = supplyTotal + taxTotal;
  return { supplyTotal, taxTotal, grandTotal };
};

const emptyEstimate = (profile) => {
  const today = fmt.today();
  return {
    date: today,
    validUntil: addDays(today, VALID_DAYS),
    issuedTo: "",
    issuedToPhone: "",
    location: "",
    items: [emptyItem()],
    payment: "cash",
    paymentCustom: "",
    memo: "",
    workerName: profile.name,
    workerCompany: profile.companyName || "",
    workerPhone: profile.phone,
    workerBusinessNumber: profile.businessNumber || "",
    workerAddress: profile.companyAddress || "",
    signatureUrl: profile.signatureUrl || "",
    createdByName: profile.name,
  };
};

// (calcItemAmount, calcTotals는 파일 하단에서 export)

// ── 세부견적서 미리보기 (이미지 변환용 마크업 포함) ──────────────
function DetailedEstimatePreview({ es, previewRef }) {
  const payLabel = es.payment === "other" ? (es.paymentCustom || "기타") : (PAY_LABEL_MAP[es.payment] || es.payment);
  const { supplyTotal, taxTotal, grandTotal } = calcTotals(es.items || []);
  const filledItems = (es.items || []).filter(it => it.name.trim());

  return (
    <div ref={previewRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:20,
      fontSize:12, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      {/* 헤더 */}
      <div style={{ textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:24, fontWeight:900, letterSpacing:6, color:"#1f2937", marginBottom:3 }}>견 적 서</div>
        <div style={{ fontSize:11, color:"#6b7280" }}>배관사무소</div>
        <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
      </div>

      {/* 수신/날짜 */}
      <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:6, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>수신</span>
            <span style={{ fontSize:15, fontWeight:800, color:"#1f2937" }}>{es.issuedTo}</span>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{fmt.date(es.date)}</div>
        </div>
        {es.issuedToPhone && (
          <div style={{ fontSize:11, color:"#6b7280", marginTop:4, marginLeft:34 }}>{fmt.phone(es.issuedToPhone)}</div>
        )}
        {es.location && (
          <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"baseline" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:28 }}>현장</span>
            <span style={{ fontSize:12, color:"#374151" }}>{es.location}</span>
          </div>
        )}
      </div>

      {/* 공급자(발신) 정보 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:"10px 14px", marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>공급자</span>
            <span style={{ fontSize:13, fontWeight:800, color:"#1f2937" }}>
              {es.workerCompany || es.workerName} {es.workerCompany ? `(대표 ${es.workerName})` : ""}
            </span>
          </div>
          {es.signatureUrl && (
            <img src={es.signatureUrl} alt="서명" crossOrigin="anonymous"
              style={{ height:32, width:"auto", maxWidth:56, objectFit:"contain" }} />
          )}
        </div>
        <div style={{ fontSize:10.5, color:"#6b7280", marginTop:6, lineHeight:1.7 }}>
          {es.workerBusinessNumber && <div>사업자등록번호: {es.workerBusinessNumber}</div>}
          {es.workerAddress && <div>주소: {es.workerAddress}</div>}
          {es.workerPhone && <div>연락처: {fmt.phone(es.workerPhone)}</div>}
        </div>
      </div>

      {/* 품목 테이블 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        <div style={{ background:"#374151", padding:"6px 12px" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>견 적 내 역</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#f1f5f9" }}>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", width:"6%" }}>No</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", textAlign:"left" }}>품명</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb" }}>규격</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", width:"9%" }}>수량</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", width:"9%" }}>단위</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", textAlign:"right" }}>단가</th>
              <th style={{ padding:"6px 4px", fontSize:10, color:"#6b7280", fontWeight:700, borderBottom:"1px solid #e5e7eb", textAlign:"right" }}>공급가액</th>
            </tr>
          </thead>
          <tbody>
            {filledItems.length === 0 && (
              <tr><td colSpan={7} style={{ padding:14, textAlign:"center", color:"#9ca3af", fontSize:11 }}>품목이 없습니다</td></tr>
            )}
            {filledItems.map((it, i) => (
              <tr key={i} style={{ background: i%2===0?"#fff":"#f8fafc" }}>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"center", borderBottom:"1px solid #f1f5f9", color:"#6b7280" }}>{i+1}</td>
                <td style={{ padding:"6px 4px", fontSize:11, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{it.name}</td>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"center", borderBottom:"1px solid #f1f5f9", color:"#374151" }}>{it.spec}</td>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"center", borderBottom:"1px solid #f1f5f9", color:"#374151" }}>{it.qty}</td>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"center", borderBottom:"1px solid #f1f5f9", color:"#374151" }}>{it.unit}</td>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"right", borderBottom:"1px solid #f1f5f9", color:"#374151" }}>{fmt.money(it.unitPrice)}</td>
                <td style={{ padding:"6px 4px", fontSize:11, textAlign:"right", borderBottom:"1px solid #f1f5f9", color:"#1f2937", fontWeight:700 }}>{fmt.money(calcItemAmount(it.qty, it.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 합계 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>견 적 금 액</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff" }}>
          <tbody>
            <tr>
              <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>공급가액 합계</td>
              <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937", textAlign:"right" }}>{fmt.money(supplyTotal)}</td>
            </tr>
            <tr>
              <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", color:"#374151" }}>세액 합계</td>
              <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937", textAlign:"right" }}>{fmt.money(taxTotal)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding:"14px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#fff", borderTop:"1px solid #e5e7eb" }}>
          <div>
            <div style={{ fontSize:10, color:"#6b7280", marginBottom:2 }}>총 합계금액</div>
            <span style={{ fontSize:20, fontWeight:900, color:"#1e3a5f" }}>{fmt.money(grandTotal)}</span>
          </div>
          <span style={{ fontSize:12, color:"#6b7280" }}>결제방식: {payLabel}</span>
        </div>
      </div>

      {/* 비고 */}
      {es.memo && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:"10px 12px", marginBottom:10 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:"#6b7280", marginBottom:4 }}>비고</div>
          <div style={{ fontSize:11.5, color:"#374151", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{es.memo}</div>
        </div>
      )}

      {/* 유효기간 안내 */}
      <div style={{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:6, padding:"10px 12px", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#92400e", marginBottom:4 }}>
          ⏰ 견적 유효기간: {fmt.date(es.date)} ~ {fmt.date(es.validUntil)}
        </div>
        <div style={{ fontSize:11, color:"#92400e", lineHeight:1.6 }}>{NOTICE_TEXT}</div>
      </div>

      {/* 작성/수정 이력 */}
      <div style={{ textAlign:"right", fontSize:9.5, color:"#9ca3af", marginTop:14, lineHeight:1.6 }}>
        <div>작성: {fmt.date(es.createdAt)} · {es.createdByName}</div>
        {es.updatedAt && es.updatedByName && (
          <div>최종수정: {fmt.date(es.updatedAt)} · {es.updatedByName}</div>
        )}
      </div>
    </div>
  );
}

// ── 작성자 선택 (가입된 사용자 목록에서 선택 + 직접 입력 겸용) ──────
function WorkerPicker({ target, set, allUsers }) {
  const [showList, setShowList] = useState(false);

  const applyUser = (u) => {
    set("workerName", u.name || "");
    set("workerCompany", u.companyName || "");
    set("workerPhone", u.phone || "");
    set("workerBusinessNumber", u.businessNumber || "");
    set("workerAddress", u.companyAddress || "");
    set("signatureUrl", u.signatureUrl || "");
    setShowList(false);
  };

  return (
    <div style={S.card}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={S.cardTitle}>공급자(발신) 정보</div>
        <button style={{ ...S.btnSmall(C.blue), padding:"5px 10px", fontSize:11 }}
          onClick={() => setShowList(s => !s)}>
          {showList ? "닫기" : "👤 다른 사용자 선택"}
        </button>
      </div>

      {showList && (
        <div style={{ marginBottom:12, maxHeight:220, overflowY:"auto",
          border:`1px solid ${C.border}`, borderRadius:10, padding:8 }}>
          {allUsers.length === 0 && (
            <div style={{ fontSize:12, color:C.text4, textAlign:"center", padding:10 }}>불러올 사용자가 없습니다</div>
          )}
          {allUsers.map(u => (
            <button key={u.id} onClick={() => applyUser(u)}
              style={{
                display:"block", width:"100%", textAlign:"left", cursor:"pointer",
                background:"rgba(255,255,255,0.03)", border:`1px solid ${C.border}`,
                borderRadius:8, padding:"8px 10px", marginBottom:6, color:C.text,
              }}>
              <div style={{ fontSize:13, fontWeight:700 }}>{u.name}{u.companyName ? ` (${u.companyName})` : ""}</div>
              {u.phone && <div style={{ fontSize:11, color:C.text4, marginTop:2 }}>{fmt.phone(u.phone)}</div>}
            </button>
          ))}
        </div>
      )}

      <div style={S.fg}>
        <label style={S.label}>이름 *</label>
        <input style={S.input} placeholder="작성자 이름" value={target.workerName}
          onChange={e => set("workerName", e.target.value)} />
      </div>
      <div style={S.fg}>
        <label style={S.label}>업체명</label>
        <input style={S.input} placeholder="업체명" value={target.workerCompany}
          onChange={e => set("workerCompany", e.target.value)} />
      </div>
      <div style={S.fg}>
        <label style={S.label}>전화번호</label>
        <input style={S.input} placeholder="전화번호" value={target.workerPhone}
          onChange={e => set("workerPhone", e.target.value.replace(/[^0-9]/g, ""))} maxLength={11} />
      </div>
      <div style={S.fg}>
        <label style={S.label}>사업자등록번호</label>
        <input style={S.input} placeholder="000-00-00000" value={target.workerBusinessNumber}
          onChange={e => set("workerBusinessNumber", e.target.value)} />
      </div>
      <div style={S.fg}>
        <label style={S.label}>주소</label>
        <input style={S.input} placeholder="회사 주소" value={target.workerAddress}
          onChange={e => set("workerAddress", e.target.value)} />
      </div>
      {target.signatureUrl && (
        <div style={{ marginTop:4 }}>
          <div style={{ fontSize:11, color:C.text4, marginBottom:4 }}>서명</div>
          <div style={{ background:"#fff", borderRadius:8, padding:6, display:"inline-block" }}>
            <img src={target.signatureUrl} alt="서명" style={{ height:36, width:"auto", maxWidth:60, objectFit:"contain" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 품목 입력 테이블 (최대 10줄) ──────────────────────────────
function ItemsEditor({ items, setItems }) {
  const setItem = (idx, key, value) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  };
  const addItem = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems([...items, emptyItem()]);
  };
  const removeItem = (idx) => {
    if (items.length <= 1) return; // 최소 1줄은 유지
    setItems(items.filter((_, i) => i !== idx));
  };

  return (
    <div style={S.card}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={S.cardTitle}>견적 품목 (최대 {MAX_ITEMS}개)</div>
        <span style={{ fontSize:11, color:C.text4 }}>{items.length}/{MAX_ITEMS}</span>
      </div>

      {items.map((it, idx) => {
        const itemAmount = calcItemAmount(it.qty, it.unitPrice);
        return (
          <div key={idx} style={{
            border:`1px solid ${C.border}`, borderRadius:10, padding:10, marginBottom:10,
            background:"rgba(255,255,255,0.02)",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:C.text3 }}>품목 {idx + 1}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(idx)}
                  style={{ background:"none", border:"none", color:C.red, fontSize:12, cursor:"pointer" }}>
                  ✕ 삭제
                </button>
              )}
            </div>
            <input style={{ ...S.input, marginBottom:8 }} placeholder="품명 (예: PVC 배관)"
              value={it.name} onChange={e => setItem(idx, "name", e.target.value)} />
            <input style={{ ...S.input, marginBottom:8 }} placeholder="규격 (예: 100mm)"
              value={it.spec} onChange={e => setItem(idx, "spec", e.target.value)} />
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <input type="number" inputMode="numeric" style={{ ...S.input, flex:1 }} placeholder="수량"
                value={it.qty} onChange={e => setItem(idx, "qty", e.target.value)} />
              <select style={{ ...S.input, flex:1 }} value={it.unit}
                onChange={e => setItem(idx, "unit", e.target.value)}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <input type="number" inputMode="numeric" style={S.input} placeholder="단가"
              value={it.unitPrice} onChange={e => setItem(idx, "unitPrice", e.target.value)} />
            {itemAmount > 0 && (
              <div style={{ fontSize:12, color:C.green, fontWeight:700, marginTop:6, textAlign:"right" }}>
                공급가액: {fmt.money(itemAmount)}
              </div>
            )}
          </div>
        );
      })}

      {items.length < MAX_ITEMS && (
        <button style={{ ...S.btnSecondary, width:"100%" }} onClick={addItem}>
          ➕ 품목 추가
        </button>
      )}
    </div>
  );
}

// ── 세부견적서 작성/보기 메인 ─────────────────────────────────
export default function DetailedEstimateForm({ profile, onBack }) {
  const [estimates, setEstimates] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState("list"); // list | edit | detail
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const previewRef = useRef();

  // 세부견적서는 공유·팀·개인 구분 없이 모든 승인된 사용자가 전체를 함께 보고 쓴다. (요구사항)
  useEffect(() => {
    const q = query(collection(db, "detailedEstimates"), orderBy("date", "desc"));
    return onSnapshot(q, snap => setEstimates(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // 작성자 선택용 - 가입된 모든 사용자의 공개용 정보(이름·업체명 등)
  // 민감정보(이메일·승인상태 등)가 없는 workerDirectory 컬렉션에서 가져온다.
  useEffect(() => {
    const q = query(collection(db, "workerDirectory"), orderBy("name", "asc"));
    return onSnapshot(q, snap => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const openNew = () => { setTarget(emptyEstimate(profile)); setView("edit"); };
  const openDetail = (es) => { setTarget(es); setView("detail"); };
  const openEdit = (es) => {
    setTarget({
      ...es,
      items: es.items && es.items.length > 0 ? es.items : [emptyItem()],
    });
    setView("edit");
  };

  const set = (k, v) => setTarget(t => {
    const next = { ...t, [k]: v };
    if (k === "date") next.validUntil = addDays(v, VALID_DAYS);
    return next;
  });
  const setItems = (items) => setTarget(t => ({ ...t, items }));

  const handleSave = async () => {
    if (!target.issuedTo.trim()) { alert("수신을 입력해주세요."); return; }
    if (!target.workerName.trim()) { alert("공급자(작성자) 이름을 입력해주세요."); return; }
    const filledItems = target.items.filter(it => it.name.trim());
    if (filledItems.length === 0) { alert("품목을 1개 이상 입력해주세요."); return; }
    if (target.payment === "other" && !target.paymentCustom.trim()) { alert("결제방식(기타)을 입력해주세요."); return; }

    setSaving(true);
    try {
      const { supplyTotal, taxTotal, grandTotal } = calcTotals(target.items);
      const data = {
        ...target,
        supplyTotal, taxTotal, amount: grandTotal,
        updatedAt: new Date().toISOString(),
        updatedByName: profile.name,
      };
      if (target.id) {
        await updateDoc(doc(db, "detailedEstimates", target.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        data.createdByName = profile.name;
        await addDoc(collection(db, "detailedEstimates"), data);
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
      await deleteDoc(doc(db, "detailedEstimates", target.id));
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
      const file = new File([blob], `세부견적서_${target.issuedTo || "현장"}_${target.date}.jpg`, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "세부견적서", files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = file.name; a.click();
        alert("이미지가 저장됐습니다. 카카오톡에서 파일 첨부로 전송해주세요.");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = `세부견적서_${target.date}.jpg`; a.click();
      }
    }
  };

  // 이미지 직접 다운로드 (카카오톡 공유와 별개로 항상 가능)
  const handleDownload = () => {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `세부견적서_${target.issuedTo || "현장"}_${target.date}.jpg`;
    a.click();
  };

  const goBackToList = () => { setView("list"); setTarget(null); setImgUrl(null); setShowImagePreview(false); };

  // ── 이미지 변환 화면 ──
  if (showImagePreview && target) {
    return (
      <div style={S.content}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => setShowImagePreview(false)} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
          <div style={S.sectionTitle}>세부견적서 이미지 변환</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <DetailedEstimatePreview es={target} previewRef={previewRef} />
        </div>
        {imgUrl && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
            <img src={imgUrl} alt="세부견적서" style={{ width:"100%", borderRadius:8 }} />
          </div>
        )}
        {!imgUrl ? (
          <button style={{ ...S.btnPrimary, opacity:generating ? 0.6 : 1 }} onClick={handleGenerateImage} disabled={generating}>
            {generating ? "⏳ 이미지 생성 중..." : "🖼 이미지로 변환"}
          </button>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...S.btnSecondary, flex:1 }} onClick={() => setImgUrl(null)}>다시 생성</button>
              <button style={{ ...S.btnPrimary, flex:2 }} onClick={handleShare}>📤 카카오톡으로 전송</button>
            </div>
            <button style={{ ...S.btnSmall(C.blue), width:"100%" }} onClick={handleDownload}>⬇️ 이미지 다운로드</button>
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
          <div style={S.sectionTitle}>세부견적서</div>
        </div>
        <button style={{ ...S.btnPrimary, marginBottom:14 }} onClick={openNew}>🧾 새 세부견적서 작성</button>
        {estimates.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0", color:C.text4, fontSize:13 }}>
            작성된 세부견적서가 없습니다.
          </div>
        )}
        {estimates.map(es => (
          <div key={es.id} style={S.listItem} onClick={() => openDetail(es)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{es.issuedTo || "(수신 미입력)"}</div>
                <div style={{ fontSize:11, color:C.text3, marginTop:3 }}>
                  {fmt.date(es.date)} · {es.workerName}{es.workerCompany ? ` (${es.workerCompany})` : ""}
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
          <div style={S.sectionTitle}>세부견적서</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <DetailedEstimatePreview es={target} previewRef={previewRef} />
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
  const { supplyTotal, taxTotal, grandTotal } = calcTotals(target.items);
  return (
    <div style={S.content}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={goBackToList} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
        <div style={S.sectionTitle}>{target.id ? "세부견적서 수정" : "세부견적서 작성"}</div>
      </div>
      {saved && <div style={S.toast(true)}>✅ 저장되었습니다!</div>}

      {/* 수신처 */}
      <div style={S.card}>
        <div style={S.cardTitle}>수신처 정보</div>
        <div style={S.fg}>
          <label style={S.label}>수신 *</label>
          <input style={S.input} placeholder="예: 홍길동님, OO공인중개사 등" value={target.issuedTo}
            onChange={e => set("issuedTo", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>연락처</label>
          <input style={S.input} placeholder="수신처 전화번호" value={target.issuedToPhone}
            onChange={e => set("issuedToPhone", e.target.value.replace(/[^0-9]/g, ""))} maxLength={11} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>현장 위치</label>
          <input style={S.input} placeholder="시공 장소 주소" value={target.location}
            onChange={e => set("location", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>날짜</label>
          <input type="date" style={S.input} value={target.date} onChange={e => set("date", e.target.value)} />
          <div style={{ fontSize:11, color:C.text4, marginTop:4 }}>
            견적 유효기간: {fmt.date(target.date)} ~ {fmt.date(target.validUntil)} (발행일+3일)
          </div>
        </div>
      </div>

      {/* 공급자(작성자) - 모든 사용자 목록에서 선택 가능 */}
      <WorkerPicker target={target} set={set} allUsers={allUsers} />

      {/* 품목 입력 (최대 10개) */}
      <ItemsEditor items={target.items} setItems={setItems} />

      {/* 합계 미리보기 */}
      <div style={{ ...S.card, background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.text3, marginBottom:4 }}>
          <span>공급가액 합계</span><span>{fmt.money(supplyTotal)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.text3, marginBottom:8 }}>
          <span>세액 합계</span><span>{fmt.money(taxTotal)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:16, fontWeight:800, color:C.green, borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
          <span>총 합계금액</span><span>{fmt.money(grandTotal)}</span>
        </div>
      </div>

      {/* 결제 방식 */}
      <div style={S.card}>
        <div style={S.cardTitle}>결제 방식</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {[["cash","💵 현금"],["card","💳 카드"],["invoice","🧾 청구"],["other","✏️ 기타"]].map(([k,l]) => (
            <button key={k} onClick={() => set("payment", k)}
              style={{ ...S.tagBtn(target.payment === k), padding:"7px 14px", fontSize:13 }}>{l}</button>
          ))}
        </div>
        {target.payment === "other" && (
          <input style={S.input} placeholder="결제방식을 입력하세요 (필수)" value={target.paymentCustom}
            onChange={e => set("paymentCustom", e.target.value)} autoFocus />
        )}
      </div>

      {/* 비고 */}
      <div style={S.card}>
        <div style={S.cardTitle}>비고 (선택)</div>
        <textarea style={S.textarea} placeholder="추가로 안내할 내용을 입력하세요"
          value={target.memo} onChange={e => set("memo", e.target.value)} />
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

export { calcItemAmount, calcTotals };
