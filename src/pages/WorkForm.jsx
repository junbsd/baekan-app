import { useState, useEffect } from "react";
import { collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt, PAY_LABEL } from "../styles/theme";
import TagInput from "../components/TagInput";
import MediaUploader from "../components/MediaUploader";

// ── 수수료 옵션 ──────────────────────────────────────────────
const FEE_OPTIONS = [
  { label:"면제", value:0 },
  { label:"10%", value:10 },
  { label:"20%", value:20 },
  { label:"30%", value:30 },
  { label:"40%", value:40 },
  { label:"직접입력", value:"custom" },
];

// ── 작업시간 옵션 ────────────────────────────────────────────
const HOUR_OPTIONS = ["30분 이내","1시간","2시간","3시간","직접입력"];

// 수수료 계산
const calcFee = (amount, feeRate) => {
  if (!amount || feeRate === 0) return 0;
  return Math.round(Number(amount) * feeRate / 100);
};
const calcNet = (amount, feeRate) => {
  return Math.max(0, Number(amount) - calcFee(amount, feeRate));
};

export default function WorkForm({ profile, editWork=null, onSaved, onCancel, userRole, userTeamId }) {
  const isEdit = !!editWork;
  const emptyForm = {
    date: fmt.today(),
    workerCompany: profile.companyName||"",
    clientCompany:"", location:"", content:"",
    equipment:[], workHours:"", amount:"",
    feeRate: 30,          // 수수료율 (기본 30%)
    feeAmount: 0,         // 수수료 금액
    netAmount: 0,         // 실수령액 (amount - feeAmount)
    payment:"cash", memo:"",
    workerName: profile.name, workerPhone: profile.phone,
  };

  const [form, setForm] = useState(isEdit ? { ...emptyForm, ...editWork } : emptyForm);
  const [files, setFiles] = useState(isEdit ? (editWork.files||[]) : []);
  const [clients, setClients] = useState([]);
  const [equipList, setEquipList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tempId] = useState(()=> isEdit ? editWork.id : `tmp_${Date.now()}`);

  // 수수료 선택 UI 상태
  const [feeMode, setFeeMode] = useState(()=>{
    if (isEdit) {
      const r = editWork.feeRate;
      if (r === 0) return "0";
      if ([10,20,30,40].includes(r)) return String(r);
      return "custom";
    }
    return "30"; // 기본 30%
  });
  const [customFee, setCustomFee] = useState(isEdit && ![0,10,20,30,40].includes(editWork.feeRate) ? String(editWork.feeRate) : "");

  // 작업시간 UI 상태
  const [hourMode, setHourMode] = useState(()=>{
    if (isEdit && editWork.workHours) {
      return HOUR_OPTIONS.includes(editWork.workHours) ? editWork.workHours : "직접입력";
    }
    return "";
  });
  const [customHour, setCustomHour] = useState(
    isEdit && editWork.workHours && !HOUR_OPTIONS.slice(0,-1).includes(editWork.workHours) ? editWork.workHours : ""
  );

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // 금액/수수료율 바뀔 때 자동 계산
  useEffect(()=>{
    const rate = feeMode === "custom" ? (Number(customFee)||0) : Number(feeMode)||0;
    const fee = calcFee(form.amount, rate);
    const net = calcNet(form.amount, rate);
    setForm(f=>({ ...f, feeRate:rate, feeAmount:fee, netAmount:net }));
  }, [form.amount, feeMode, customFee]);

  // 작업시간 동기화
  useEffect(()=>{
    if (hourMode === "직접입력") {
      set("workHours", customHour);
    } else {
      set("workHours", hourMode);
    }
  }, [hourMode, customHour]);

  // 발주업체 목록
  useEffect(()=>{
    const q = query(collection(db,"clients"), orderBy("usedCount","desc"));
    return onSnapshot(q, snap => setClients(snap.docs.map(d=>d.data().name)));
  },[]);

  // 장비 목록
  useEffect(()=>{
    const q = query(collection(db,"equipment"), orderBy("usedCount","desc"));
    return onSnapshot(q, snap => setEquipList(snap.docs.map(d=>d.data().name)));
  },[]);

  const addClient = async (name) => {
    const r = doc(db,"clients",name);
    const s = await getDoc(r);
    if (s.exists()) await updateDoc(r,{ usedCount:(s.data().usedCount||0)+1 });
    else await setDoc(r,{ name, usedCount:1, createdAt:new Date().toISOString() });
  };

  const addEquipment = async (name) => {
    const r = doc(db,"equipment",name);
    const s = await getDoc(r);
    if (s.exists()) await updateDoc(r,{ usedCount:(s.data().usedCount||0)+1 });
    else await setDoc(r,{ name, usedCount:1, createdAt:new Date().toISOString() });
  };

  const toggleEquip = (e) => set("equipment", form.equipment.includes(e) ? form.equipment.filter(x=>x!==e) : [...form.equipment,e]);
  const toggleClient = (c) => set("clientCompany", form.clientCompany===c ? "" : c);

  const handleSave = async () => {
    if (!form.clientCompany) { alert("발주업체를 입력해주세요."); return; }
    if (!form.amount) { alert("금액을 입력해주세요."); return; }
    setSaving(true);
    try {
      const data = { teamId: userTeamId || null,
        ...form,
        amount: Number(form.amount),
        feeRate: form.feeRate,
        feeAmount: form.feeAmount,
        netAmount: form.netAmount,
        files,
        updatedAt: new Date().toISOString(),
      };
      if (isEdit) {
        await updateDoc(doc(db,"works",editWork.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db,"works"), data);
        if (form.clientCompany) await addClient(form.clientCompany);
        for (const e of form.equipment) await addEquipment(e);
      }
      setSaved(true);
      if (!isEdit) { setForm({...emptyForm}); setFeeMode("30"); setHourMode(""); }
      setFiles([]);
      setTimeout(()=>{ setSaved(false); onSaved?.(); }, 1800);
    } catch(e) { alert("저장 중 오류: "+e.message); }
    setSaving(false);
  };

  const feeAmt = form.feeAmount || 0;
  const netAmt = form.netAmount || 0;

  return (
    <div style={S.content}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        {onCancel && <button onClick={onCancel} style={{ background:"none", border:"none", color:C.text2, fontSize:22, cursor:"pointer" }}>←</button>}
        <div style={S.sectionTitle}>{isEdit?"작업 수정":"작업 기록 입력"}</div>
      </div>
      {saved && <div style={S.toast(true)}>✅ {isEdit?"수정":"저장"}되었습니다!</div>}

      {/* 기본정보 */}
      <div style={S.card}>
        <div style={S.cardTitle}>기본 정보</div>
        <div style={S.fg}>
          <label style={S.label}>날짜</label>
          <input type="date" style={S.input} value={form.date} onChange={e=>set("date",e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>작업자 업체명</label>
          <input style={S.input} placeholder="예: 홍길동배관" value={form.workerCompany}
            onChange={e=>set("workerCompany",e.target.value)} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div style={S.fg}>
            <label style={S.label}>작업자 이름</label>
            <input style={{ ...S.input, color:C.text3 }} value={form.workerName} readOnly />
          </div>
          <div style={S.fg}>
            <label style={S.label}>전화번호</label>
            <input style={{ ...S.input, color:C.text3 }} value={fmt.phone(form.workerPhone)} readOnly />
          </div>
        </div>
      </div>

      {/* 발주업체 */}
      <div style={S.card}>
        <div style={S.cardTitle}>📋 발주업체 *</div>
        <TagInput
          items={clients}
          selected={form.clientCompany ? [form.clientCompany] : []}
          onToggle={toggleClient}
          onAdd={()=>{}}
          multi={false}
          placeholder="발주업체명 입력 후 Enter"
        />
        {form.clientCompany && (
          <div style={{ marginTop:8, fontSize:12, color:C.blue }}>
            ✓ 선택됨: <strong>{form.clientCompany}</strong>
          </div>
        )}
      </div>

      {/* 시공 내용 */}
      <div style={S.card}>
        <div style={S.cardTitle}>시공 내용</div>
        <div style={S.fg}>
          <label style={S.label}>시공 장소</label>
          <input style={S.input} placeholder="예: 서울시 강남구 역삼동 123" value={form.location}
            onChange={e=>set("location",e.target.value)} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>시공 내용</label>
          <textarea style={S.textarea} placeholder="시공 내용을 상세히 입력하세요" value={form.content}
            onChange={e=>set("content",e.target.value)} />
        </div>
        <div style={S.fg}>
          <TagInput
            label="🛠 사용 장비 (복수 선택)"
            items={equipList}
            selected={form.equipment}
            onToggle={toggleEquip}
            onAdd={()=>{}}
            multi={true}
            placeholder="장비명 입력 후 Enter (새 장비 추가됨)"
          />
        </div>

        {/* 작업시간 - 빠른 선택 */}
        <div style={S.fg}>
          <label style={S.label}>⏱ 작업 시간</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
            {HOUR_OPTIONS.map(opt=>(
              <button key={opt} onClick={()=>setHourMode(opt)}
                style={{ ...S.tagBtn(hourMode===opt), padding:"7px 14px", fontSize:13 }}>
                {opt}
              </button>
            ))}
          </div>
          {hourMode==="직접입력" && (
            <input style={S.input} placeholder="예: 4시간 30분, 반일, 종일" value={customHour}
              onChange={e=>setCustomHour(e.target.value)} autoFocus />
          )}
          {hourMode && hourMode!=="직접입력" && (
            <div style={{ fontSize:12, color:C.blue, marginTop:4 }}>✓ {hourMode} 선택됨</div>
          )}
        </div>
      </div>

      {/* 결제 정보 */}
      <div style={S.card}>
        <div style={S.cardTitle}>결제 정보</div>

        {/* 금액 */}
        <div style={S.fg}>
          <label style={S.label}>청구 금액 *</label>
          <input type="number" style={S.input} placeholder="0" value={form.amount}
            onChange={e=>set("amount",e.target.value)} />
          {form.amount && <div style={{ fontSize:13, color:C.green, marginTop:4, fontWeight:700 }}>{fmt.money(form.amount)}</div>}
        </div>

        {/* 수수료 선택 */}
        <div style={S.fg}>
          <label style={S.label}>💸 수수료</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
            {FEE_OPTIONS.map(opt=>(
              <button key={opt.label}
                onClick={()=>setFeeMode(opt.value==="custom"?"custom":String(opt.value))}
                style={{ ...S.tagBtn(feeMode===(opt.value==="custom"?"custom":String(opt.value))), padding:"7px 14px", fontSize:13 }}>
                {opt.label}
              </button>
            ))}
          </div>
          {feeMode==="custom" && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="number" style={{ ...S.input, flex:1 }} placeholder="수수료율 입력" value={customFee}
                onChange={e=>setCustomFee(e.target.value)} min="0" max="100" />
              <span style={{ fontSize:13, color:C.text2, whiteSpace:"nowrap" }}>%</span>
            </div>
          )}
          {/* 수수료 계산 결과 */}
          {form.amount && (
            <div style={{ marginTop:10, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:C.text3 }}>청구금액</span>
                <span style={{ fontSize:13, color:C.text }}>{fmt.money(form.amount)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:C.text3 }}>수수료 ({form.feeRate}%)</span>
                <span style={{ fontSize:13, color:C.red }}>- {fmt.money(feeAmt)}</span>
              </div>
              <div style={{ height:1, background:C.border, margin:"6px 0" }} />
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:13, color:C.text2, fontWeight:700 }}>실수령액</span>
                <span style={{ fontSize:16, color:C.green, fontWeight:800 }}>{fmt.money(netAmt)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 결제 방식 */}
        <div style={S.fg}>
          <label style={S.label}>결제 방식</label>
          <div style={S.payRow}>
            {[["cash","💵 현금",C.green],["card","💳 카드",C.blue],["credit","⏳ 외상",C.yellow]].map(([k,l,c])=>(
              <button key={k} style={S.payBtn(form.payment===k,c)} onClick={()=>set("payment",k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 사진·영상 */}
      <div style={S.card}>
        <div style={S.cardTitle}>📷 사진 · 영상</div>
        <MediaUploader workId={tempId} existingFiles={files} onFilesChange={setFiles} />
      </div>

      {/* 메모 */}
      <div style={S.card}>
        <div style={S.cardTitle}>기타 메모</div>
        <textarea style={{ ...S.textarea, minHeight:60 }} placeholder="외상 내용, 특이사항 등"
          value={form.memo} onChange={e=>set("memo",e.target.value)} />
      </div>

      <div style={{ display:"flex", gap:10 }}>
        {onCancel && <button style={{ ...S.btnSecondary, flex:1 }} onClick={onCancel}>취소</button>}
        <button style={{ ...S.btnPrimary, flex:2, opacity:saving?0.6:1 }} onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : isEdit ? "✏️ 수정 저장" : "💾 작업 저장"}
        </button>
      </div>
    </div>
  );
}
