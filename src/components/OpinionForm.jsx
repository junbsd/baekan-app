import { useState, useRef } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

// ── 소견 유형 빠른 선택 ──────────────────────────────────────
const ISSUE_TYPES = ["누수", "배관 막힘", "하수구 막힘", "동파", "결로/누수의심", "기타"];

const emptyOpinion = (work, profile) => ({
  workId: work.id,
  date: fmt.today(),
  issueType: "누수",
  issuedTo: "",
  location: work.location || "",
  findings: "",
  opinion: "",
  recommendation: "",
  clientCompany: work.clientCompany || "",
  photoUrls: [],
  workerName: profile.name,
  workerCompany: profile.companyName || "",
  workerPhone: profile.phone,
  signatureUrl: profile.signatureUrl || "",
});

// ── 소견서 미리보기 (이미지 변환용 마크업 포함) ──────────────
function OpinionPreview({ op, previewRef }) {
  // 구버전 호환: issuedToType/issuedToCustom으로 저장된 기존 데이터 대응
  const issuedTo = op.issuedTo || (op.issuedToType === "기타" ? op.issuedToCustom : op.issuedToType) || "";
  return (
    <div ref={previewRef} style={{ background:"#fff", color:"#1f2937", borderRadius:8, padding:20,
      fontSize:12, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      {/* 헤더 */}
      <div style={{ textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:24, fontWeight:900, letterSpacing:6, color:"#1f2937", marginBottom:3 }}>소 견 서</div>
        <div style={{ fontSize:11, color:"#6b7280" }}>배관사무소</div>
        <div style={{ height:2, background:"#1f2937", marginTop:10 }} />
      </div>

      {/* 수신/날짜 */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:6, padding:"12px 14px", marginBottom:10 }}>
        <div>
          <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:36 }}>수신</span>
            <span style={{ fontSize:15, fontWeight:800, color:"#1f2937" }}>{issuedTo}</span>
          </div>
          {op.clientCompany && (
            <div style={{ display:"flex", gap:6, alignItems:"baseline", marginTop:4 }}>
              <span style={{ fontSize:11, color:"#6b7280", fontWeight:700, minWidth:36 }}>현장</span>
              <span style={{ fontSize:12, color:"#374151" }}>{op.clientCompany}</span>
            </div>
          )}
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{fmt.date(op.date)}</div>
      </div>

      {/* 소견유형 / 점검위치 - 헤더 없이 표시 */}
      <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            {[["소견 유형", op.issueType], ["점검 위치", op.location]].map(([k,v], i) => v ? (
              <tr key={k} style={{ background: i%2===0?"#fff":"#f8fafc" }}>
                <td style={{ padding:"7px 12px", fontWeight:700, fontSize:11, borderBottom:"1px solid #f1f5f9", width:"30%", color:"#374151" }}>{k}</td>
                <td style={{ padding:"7px 12px", fontSize:12, borderBottom:"1px solid #f1f5f9", color:"#1f2937" }}>{v}</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>

      {/* 점검내용 (파란 배경) */}
      {op.findings && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
          <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>점 검 내 용</span>
          </div>
          <div style={{ padding:"10px 12px", fontSize:12, color:"#1f2937", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{op.findings}</div>
        </div>
      )}

      {/* 소견 (파란 배경) */}
      {op.opinion && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
          <div style={{ background:"#1e3a5f", padding:"6px 12px" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>소 견</span>
          </div>
          <div style={{ padding:"10px 12px", fontSize:12, color:"#1f2937", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{op.opinion}</div>
        </div>
      )}

      {/* 조치내용 (노란 배경) */}
      {op.recommendation && (
        <div style={{ border:"1px solid #fde68a", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
          <div style={{ background:"#fef3c7", padding:"6px 12px" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#92400e", letterSpacing:1 }}>조 치 내 용</span>
          </div>
          <div style={{ padding:"10px 12px", fontSize:12, color:"#1f2937", lineHeight:1.7, background:"#fffbeb", whiteSpace:"pre-wrap" }}>{op.recommendation}</div>
        </div>
      )}

      {/* 첨부 사진 */}
      {op.photoUrls && op.photoUrls.length > 0 && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:10 }}>
          <div style={{ background:"#374151", padding:"6px 12px" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:1 }}>첨 부 사 진</span>
          </div>
          <div style={{ padding:10, display:"flex", flexWrap:"wrap", gap:6, background:"#fff" }}>
            {op.photoUrls.map((url, i) => (
              <img key={i} src={url} alt={`첨부사진${i+1}`} crossOrigin="anonymous"
                style={{ width: op.photoUrls.length===1 ? "100%" : "calc(50% - 3px)", aspectRatio:"4/3", objectFit:"cover", borderRadius:4 }} />
            ))}
          </div>
        </div>
      )}

      {/* 작성자/서명 */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        borderTop:"1px solid #e5e7eb", paddingTop:12, marginTop:14 }}>
        <div>
          <div style={{ fontSize:11, color:"#6b7280" }}>작성자</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#1f2937" }}>
              {op.workerName}{op.workerCompany ? ` (${op.workerCompany})` : ""}
            </span>
            {op.signatureUrl && (
              <img src={op.signatureUrl} alt="서명" crossOrigin="anonymous"
                style={{ height:32, width:"auto", maxWidth:56, objectFit:"contain" }} />
            )}
          </div>
          {op.workerPhone && <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{fmt.phone(op.workerPhone)}</div>}
        </div>
        <div style={{ fontSize:10, color:"#9ca3af", textAlign:"right" }}>
          발행일: {fmt.date(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
}

// ── 소견서 작성/보기 모달 ─────────────────────────────────────
export default function OpinionForm({ work, profile, existingOpinion=null, onClose, onSaved }) {
  const isEdit = !!existingOpinion;
  const initialOp = isEdit
    ? {
        ...existingOpinion,
        photoUrls: existingOpinion.photoUrls || [],
        issuedTo: existingOpinion.issuedTo || (existingOpinion.issuedToType === "기타" ? existingOpinion.issuedToCustom : existingOpinion.issuedToType) || "",
      }
    : emptyOpinion(work, profile);
  const [op, setOp] = useState(initialOp);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState(isEdit ? "view" : "edit"); // view | edit
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const previewRef = useRef();

  // work에 첨부된 사진 목록 (영상 제외)
  const workPhotos = (work.files || []).filter(f => f.type === "image");

  const set = (k, v) => setOp(o => ({ ...o, [k]: v }));

  const togglePhoto = (url) => {
    setOp(o => {
      const cur = o.photoUrls || [];
      if (cur.includes(url)) return { ...o, photoUrls: cur.filter(u => u !== url) };
      if (cur.length >= 2) return o; // 최대 2장
      return { ...o, photoUrls: [...cur, url] };
    });
  };

  const handleSave = async () => {
    if (!op.opinion.trim()) { alert("소견 내용을 입력해주세요."); return; }
    if (!op.issuedTo.trim()) { alert("발급 대상(수신)을 입력해주세요."); return; }
    setSaving(true);
    try {
      const data = { ...op, photoUrls: op.photoUrls || [], updatedAt: new Date().toISOString() };
      if (isEdit) {
        await updateDoc(doc(db, "opinions", existingOpinion.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, "opinions"), data);
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved?.(); }, 1200);
    } catch (e) {
      alert("저장 중 오류: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("이 소견서를 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "opinions", existingOpinion.id));
      onSaved?.();
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
      const file = new File([blob], `소견서_${op.clientCompany || "현장"}_${op.date}.jpg`, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "소견서", files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = file.name; a.click();
        alert("이미지가 저장됐습니다. 카카오톡에서 파일 첨부로 전송해주세요.");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        const a = document.createElement("a");
        a.href = imgUrl; a.download = `소견서_${op.date}.jpg`; a.click();
      }
    }
  };

  // ── 이미지 변환 화면 ──
  if (showImagePreview) {
    return (
      <div style={S.overlay} onClick={() => setShowImagePreview(false)}>
        <div style={{ ...S.modal, paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>소견서 이미지 변환</div>
            <button onClick={() => setShowImagePreview(false)}
              style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <OpinionPreview op={op} previewRef={previewRef} />
          </div>
          {imgUrl && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:700 }}>✅ 이미지 생성 완료</div>
              <img src={imgUrl} alt="소견서" style={{ width:"100%", borderRadius:8 }} />
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
      </div>
    );
  }

  // ── 보기 모드 ──
  if (mode === "view") {
    return (
      <div style={S.overlay} onClick={onClose}>
        <div style={{ ...S.modal, paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>소견서</div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <OpinionPreview op={op} previewRef={previewRef} />
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button style={{ ...S.btnSmall(C.purple), flex:1 }} onClick={() => setShowImagePreview(true)}>🖼 이미지 변환</button>
            <button style={{ ...S.btnSmall(C.blue), flex:1 }} onClick={() => setMode("edit")}>✏️ 수정</button>
          </div>
          <button style={S.btnDanger} onClick={handleDelete}>🗑 삭제</button>
        </div>
      </div>
    );
  }

  // ── 작성/수정 모드 ──
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{isEdit ? "소견서 수정" : "소견서 작성"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        {saved && <div style={S.toast(true)}>✅ 저장되었습니다!</div>}

        {/* 기본 정보 */}
        <div style={S.card}>
          <div style={S.cardTitle}>기본 정보</div>
          <div style={S.fg}>
            <label style={S.label}>날짜</label>
            <input type="date" style={S.input} value={op.date} onChange={e => set("date", e.target.value)} />
          </div>
          <div style={S.fg}>
            <label style={S.label}>현장(발주업체)</label>
            <input style={S.input} value={op.clientCompany} onChange={e => set("clientCompany", e.target.value)} />
          </div>
          <div style={S.fg}>
            <label style={S.label}>점검 위치</label>
            <input style={S.input} placeholder="예: 안방 화장실 천장" value={op.location} onChange={e => set("location", e.target.value)} />
          </div>
        </div>

        {/* 발급 대상 */}
        <div style={S.card}>
          <div style={S.cardTitle}>📨 발급 대상(수신) *</div>
          <input style={S.input} placeholder="예: 전 집주인, 보험회사, OO화재 등"
            value={op.issuedTo} onChange={e => set("issuedTo", e.target.value)} />
        </div>

        {/* 소견 유형 */}
        <div style={S.card}>
          <div style={S.cardTitle}>🔍 소견 유형</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ISSUE_TYPES.map(t => (
              <button key={t} onClick={() => set("issueType", t)}
                style={{ ...S.tagBtn(op.issueType === t), padding:"7px 14px", fontSize:13 }}>{t}</button>
            ))}
          </div>
        </div>

        {/* 점검내용 / 소견 / 조치내용 */}
        <div style={S.card}>
          <div style={S.cardTitle}>점검내용 및 소견</div>
          <div style={S.fg}>
            <label style={S.label}>점검내용</label>
            <textarea style={S.textarea} placeholder="현장에서 확인한 상태를 입력하세요"
              value={op.findings} onChange={e => set("findings", e.target.value)} />
          </div>
          <div style={S.fg}>
            <label style={S.label}>소견 *</label>
            <textarea style={S.textarea} placeholder="누수/막힘 등의 원인 및 소견을 입력하세요"
              value={op.opinion} onChange={e => set("opinion", e.target.value)} />
          </div>
          <div style={S.fg}>
            <label style={S.label}>조치내용</label>
            <textarea style={{ ...S.textarea, minHeight:60 }} placeholder="진행했거나 권장하는 조치내용 (선택)"
              value={op.recommendation} onChange={e => set("recommendation", e.target.value)} />
          </div>
        </div>

        {/* 사진 첨부 - work에 사진이 있을 때만 표시, 항상 선택 가능 (0~2장) */}
        {workPhotos.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>📷 사진 첨부 (선택, 최대 2장)</div>
            <div style={{ fontSize:11, color:C.text4, marginBottom:8 }}>
              소견서에 넣을 사진을 선택하세요. 선택하지 않으면 사진 없이 저장됩니다. ({(op.photoUrls||[]).length}/2)
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {workPhotos.map((f, i) => {
                const selected = (op.photoUrls||[]).includes(f.url);
                return (
                  <div key={i} onClick={() => togglePhoto(f.url)}
                    style={{ position:"relative", width:"calc(50% - 4px)", aspectRatio:"4/3", borderRadius:8, overflow:"hidden",
                      border: selected ? `3px solid ${C.green}` : `1px solid ${C.border2}`, cursor:"pointer" }}>
                    <img src={f.url} alt={f.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    {selected && (
                      <div style={{ position:"absolute", top:4, right:4, background:C.green, color:"#fff",
                        borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center",
                        justifyContent:"center", fontSize:13, fontWeight:700 }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 작성자 정보 (읽기전용 + 서명 미리보기) */}
        <div style={S.card}>
          <div style={S.cardTitle}>작성자 정보</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, color:C.text, fontWeight:700 }}>
                {op.workerName}{op.workerCompany ? ` (${op.workerCompany})` : ""}
              </div>
              <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>{fmt.phone(op.workerPhone)}</div>
            </div>
            {op.signatureUrl ? (
              <div style={{ background:"#fff", borderRadius:8, padding:6 }}>
                <img src={op.signatureUrl} alt="서명" style={{ height:36, width:"auto", maxWidth:60, objectFit:"contain" }} />
              </div>
            ) : (
              <div style={{ fontSize:11, color:C.text4 }}>설정에서 서명을 등록하세요</div>
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button style={{ ...S.btnSecondary, flex:1 }} onClick={onClose}>취소</button>
          <button style={{ ...S.btnPrimary, flex:2, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : isEdit ? "✏️ 수정 저장" : "💾 소견서 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
