import { useState, useRef, useEffect } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const PAY_LABEL_MAP = { cash: "현금", card: "카드", invoice: "청구" };

// ── 금액을 한글로 표기 (예: 110000 -> "일십일만원整") ──────────────
// 만/억/조 단위에서도 "일"을 생략하지 않는 표준 표기 방식(오해 소지 없이 명확함)
const KO_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const KO_SMALL_UNITS = ["", "십", "백", "천"];
const KO_BIG_UNITS = ["", "만", "억", "조"];

function convertFourDigitsToKorean(num) {
  if (num === 0) return "";
  let result = "";
  const digits = String(num).padStart(4, "0").split("").map(Number);
  for (let i = 0; i < 4; i++) {
    const d = digits[i];
    if (d === 0) continue;
    const isOnesPlace = (i === 3);
    const digitStr = (d === 1 && !isOnesPlace) ? "" : KO_DIGITS[d];
    result += digitStr + KO_SMALL_UNITS[3 - i];
  }
  return result;
}

const numberToKoreanAmount = (num) => {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return "영원整";
  if (n < 0) return "-" + numberToKoreanAmount(-n);

  let remaining = n;
  const groups = [];
  while (remaining > 0) {
    groups.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }

  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    result += convertFourDigitsToKorean(groups[i]) + KO_BIG_UNITS[i];
  }
  return result + "원整";
};

const emptyReceipt = (profile) => ({
  date: fmt.today(),
  receivedFrom: "",
  content: "",
  amount: "",
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
});

// ── 영수증 미리보기 (이미지 변환용 마크업 포함) ──────────────
function ReceiptPreview({ rc, previewRef }) {
  const payLabel = rc.payment === "other" ? (rc.paymentCustom || "기타") : (PAY_LABEL_MAP[rc.payment] || rc.payment);
  return (
    <div ref={previewRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:24,
      fontSize:12, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      {/* 헤더 */}
      <div style={{ textAlign:"center", marginBottom:18 }}>
        <div style={{ fontSize:26, fontWeight:900, letterSpacing:10, color:"#1f2937" }}>영 수 증</div>
        <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
      </div>

      {/* 금액 (한글 표기 포함, 가장 강조) */}
      <div style={{ border:"2px solid #1f2937", borderRadius:6, padding:"14px 16px", marginBottom:14, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>금 액</div>
        <div style={{ fontSize:15, fontWeight:800, color:"#1f2937", marginBottom:4 }}>
          금 {numberToKoreanAmount(rc.amount)}
        </div>
        <div style={{ fontSize:22, fontWeight:900, color:"#1e3a5f" }}>{fmt.money(rc.amount)}</div>
      </div>

      {/* 영수 확인 문구 */}
      <div style={{ textAlign:"center", fontSize:13, fontWeight:700, color:"#374151", marginBottom:16 }}>
        위 금액을 정히 영수함
      </div>

      {/* 내용/적요 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:"10px 14px", marginBottom:12 }}>
        <div style={{ display:"flex", gap:6, marginBottom: rc.receivedFrom ? 6 : 0 }}>
          <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:44 }}>받는분</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#1f2937" }}>{rc.receivedFrom || "-"}</span>
        </div>
        {rc.content && (
          <div style={{ display:"flex", gap:6 }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:44 }}>적요</span>
            <span style={{ fontSize:12, color:"#374151" }}>{rc.content}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
          <span style={{ fontSize:11, color:"#6b7280" }}>결제방식: {payLabel}</span>
          <span style={{ fontSize:11, color:"#6b7280" }}>{fmt.date(rc.date)}</span>
        </div>
      </div>

      {/* 비고 */}
      {rc.memo && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:"8px 12px", marginBottom:12 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:"#6b7280", marginBottom:3 }}>비고</div>
          <div style={{ fontSize:11.5, color:"#374151", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{rc.memo}</div>
        </div>
      )}

      {/* 공급자(발행) 정보 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:"10px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"#1f2937" }}>
              {rc.workerCompany || rc.workerName} {rc.workerCompany ? `(대표 ${rc.workerName})` : ""}
            </div>
            <div style={{ fontSize:10.5, color:"#6b7280", marginTop:4, lineHeight:1.7 }}>
              {rc.workerBusinessNumber && <div>사업자등록번호: {rc.workerBusinessNumber}</div>}
              {rc.workerAddress && <div>주소: {rc.workerAddress}</div>}
              {rc.workerPhone && <div>연락처: {fmt.phone(rc.workerPhone)}</div>}
            </div>
          </div>
          {rc.signatureUrl && (
            <img src={rc.signatureUrl} alt="서명" crossOrigin="anonymous"
              style={{ height:36, width:"auto", maxWidth:60, objectFit:"contain" }} />
          )}
        </div>
      </div>

      {/* 작성/수정 이력 */}
      <div style={{ textAlign:"right", fontSize:9.5, color:"#9ca3af", marginTop:14, lineHeight:1.6 }}>
        <div>작성: {fmt.date(rc.createdAt)} · {rc.createdByName}</div>
        {rc.updatedAt && rc.updatedByName && (
          <div>최종수정: {fmt.date(rc.updatedAt)} · {rc.updatedByName}</div>
        )}
      </div>
    </div>
  );
}

// ── 작성자 선택 (세부견적서와 동일하게 가입된 사용자 목록에서 선택 + 직접 입력 겸용) ──
function ReceiptWorkerPicker({ target, set, allUsers }) {
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
        <div style={S.cardTitle}>공급자(발행) 정보</div>
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

// ── 간이영수증 작성/보기 메인 ─────────────────────────────────
export default function ReceiptForm({ profile, onBack }) {
  const [receipts, setReceipts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState("list"); // list | edit | detail
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const previewRef = useRef();

  // 간이영수증은 공유·팀·개인 구분 없이 모든 승인된 사용자가 전체를 함께 보고 쓴다. (요구사항)
  useEffect(() => {
    const q = query(collection(db, "receipts"), orderBy("date", "desc"));
    return onSnapshot(q, snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // 작성자 선택용 - 세부견적서와 동일한 workerDirectory 컬렉션 재사용
  useEffect(() => {
    const q = query(collection(db, "workerDirectory"), orderBy("name", "asc"));
    return onSnapshot(q, snap => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const openNew = () => { setTarget(emptyReceipt(profile)); setView("edit"); };
  const openDetail = (rc) => { setTarget(rc); setView("detail"); };
  const openEdit = (rc) => { setTarget({ ...rc }); setView("edit"); };

  const set = (k, v) => setTarget(t => ({ ...t, [k]: v }));

  const handleSave = async () => {
    if (!target.receivedFrom.trim()) { alert("받는분(지불하신 분)을 입력해주세요."); return; }
    if (!target.workerName.trim()) { alert("공급자(작성자) 이름을 입력해주세요."); return; }
    if (!target.amount) { alert("금액을 입력해주세요."); return; }
    if (target.payment === "other" && !target.paymentCustom.trim()) { alert("결제방식(기타)을 입력해주세요."); return; }

    setSaving(true);
    try {
      const data = {
        ...target,
        amount: Number(target.amount),
        updatedAt: new Date().toISOString(),
        updatedByName: profile.name,
      };
      if (target.id) {
        await updateDoc(doc(db, "receipts", target.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        data.createdByName = profile.name;
        await addDoc(collection(db, "receipts"), data);
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); setView("list"); setTarget(null); }, 1200);
    } catch (e) {
      alert("저장 중 오류: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("이 영수증을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "receipts", target.id));
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
      const file = new File([blob], `간이영수증_${target.receivedFrom || "고객"}_${target.date}.jpg`, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "간이영수증", files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = file.name; a.click();
        alert("이미지가 저장됐습니다. 카카오톡에서 파일 첨부로 전송해주세요.");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = `간이영수증_${target.date}.jpg`; a.click();
      }
    }
  };

  // 이미지 직접 다운로드 (카카오톡 공유와 별개로 항상 가능)
  const handleDownload = () => {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `간이영수증_${target.receivedFrom || "고객"}_${target.date}.jpg`;
    a.click();
  };

  const goBackToList = () => { setView("list"); setTarget(null); setImgUrl(null); setShowImagePreview(false); };

  // ── 이미지 변환 화면 ──
  if (showImagePreview && target) {
    return (
      <div style={S.content}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => setShowImagePreview(false)} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>
          <div style={S.sectionTitle}>영수증 이미지 변환</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <ReceiptPreview rc={target} previewRef={previewRef} />
        </div>
        {imgUrl && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
            <img src={imgUrl} alt="영수증" style={{ width:"100%", borderRadius:8 }} />
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
          <div style={S.sectionTitle}>간이영수증</div>
        </div>
        <button style={{ ...S.btnPrimary, marginBottom:14 }} onClick={openNew}>🧾 새 영수증 작성</button>
        {receipts.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0", color:C.text4, fontSize:13 }}>
            작성된 영수증이 없습니다.
          </div>
        )}
        {receipts.map(rc => (
          <div key={rc.id} style={S.listItem} onClick={() => openDetail(rc)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{rc.receivedFrom || "(받는분 미입력)"}</div>
                <div style={{ fontSize:11, color:C.text3, marginTop:3 }}>
                  {fmt.date(rc.date)} · {rc.workerName}{rc.workerCompany ? ` (${rc.workerCompany})` : ""}
                </div>
                <div style={{ fontSize:13, color:C.green, marginTop:3, fontWeight:700 }}>{fmt.money(rc.amount)}</div>
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
          <div style={S.sectionTitle}>간이영수증</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <ReceiptPreview rc={target} previewRef={previewRef} />
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
        <div style={S.sectionTitle}>{target.id ? "영수증 수정" : "영수증 작성"}</div>
      </div>
      {saved && <div style={S.toast(true)}>✅ 저장되었습니다!</div>}

      <div style={S.card}>
        <div style={S.cardTitle}>영수 정보</div>
        <div style={S.fg}>
          <label style={S.label}>받는분(지불하신 분) *</label>
          <input style={S.input} placeholder="예: 홍길동님, OO공인중개사 등" value={target.receivedFrom}
            onChange={e => set("receivedFrom", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>날짜</label>
          <input type="date" style={S.input} value={target.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>금액 *</label>
          <input type="number" inputMode="numeric" style={S.input} placeholder="0" value={target.amount}
            onChange={e => set("amount", e.target.value)} />
          {target.amount > 0 && (
            <div style={{ fontSize:12, color:C.green, marginTop:4, fontWeight:700 }}>
              {fmt.money(target.amount)} (금 {numberToKoreanAmount(target.amount)})
            </div>
          )}
        </div>
        <div style={S.fg}>
          <label style={S.label}>적요(내용)</label>
          <input style={S.input} placeholder="예: 배관 수리비로, 계약금으로 등" value={target.content}
            onChange={e => set("content", e.target.value)} />
        </div>
      </div>

      {/* 공급자(작성자) - 모든 사용자 목록에서 선택 가능 */}
      <ReceiptWorkerPicker target={target} set={set} allUsers={allUsers} />

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

      <div style={{ display:"flex", gap:10 }}>
        <button style={{ ...S.btnSecondary, flex:1 }} onClick={goBackToList}>취소</button>
        <button style={{ ...S.btnPrimary, flex:2, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : target.id ? "✏️ 수정 저장" : "💾 영수증 저장"}
        </button>
      </div>
    </div>
  );
}

export { numberToKoreanAmount };
