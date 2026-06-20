import { useState } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const CATS = ["재료비","유류비","장비구매","장비임대","차량비","식대","기타"];

function ExpenseModal({ expense=null, onClose, onSaved }) {
  const isEdit = !!expense;
  const [form, setForm] = useState(expense || { date:fmt.today(), category:"재료비", desc:"", amount:"", memo:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.amount) { alert("금액을 입력하세요."); return; }
    setSaving(true);
    try {
      const data = { ...form, amount:Number(form.amount), updatedAt:new Date().toISOString() };
      if (isEdit) await updateDoc(doc(db,"expenses",expense.id), data);
      else { data.createdAt = new Date().toISOString(); await addDoc(collection(db,"expenses"),data); }
      onSaved();
    } catch(e) { alert("저장 오류: "+e.message); }
    setSaving(false);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{isEdit?"지출 수정":"지출 입력"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        <div style={S.fg}><label style={S.label}>날짜</label>
          <input type="date" style={S.input} value={form.date} onChange={e=>set("date",e.target.value)} /></div>
        <div style={S.fg}><label style={S.label}>항목</label>
          <select style={S.select} value={form.category} onChange={e=>set("category",e.target.value)}>
            {CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        <div style={S.fg}><label style={S.label}>내용</label>
          <input style={S.input} placeholder="예: PVC 파이프 20m" value={form.desc} onChange={e=>set("desc",e.target.value)} /></div>
        <div style={S.fg}><label style={S.label}>금액 *</label>
          <input type="number" style={S.input} placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)} />
          {form.amount&&<div style={{ fontSize:12,color:C.red,marginTop:4 }}>{fmt.money(form.amount)}</div>}</div>
        <div style={S.fg}><label style={S.label}>메모</label>
          <textarea style={{ ...S.textarea,minHeight:60 }} value={form.memo} onChange={e=>set("memo",e.target.value)} /></div>
        <button style={{ ...S.btnPrimary,opacity:saving?0.6:1 }} onClick={handleSave} disabled={saving}>
          {saving?"저장 중...":isEdit?"수정 저장":"저장"}</button>
      </div>
    </div>
  );
}

export default function ExpenseList({ expenses, userRole, userTeamId, profile }) {
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db,"expenses",id)); setConfirmDelete(null); }
    catch(e) { alert("삭제 오류: "+e.message); }
  };

  const filtered = expenses.filter(e=>{
    const s = search.toLowerCase();
    const matchS = !s||[e.category,e.desc,e.memo].some(v=>v?.toLowerCase().includes(s));
    return matchS&&(!filterMonth||e.date?.startsWith(filterMonth))&&(!filterCat||e.category===filterCat);
  });

  const total = filtered.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const byCat = CATS.map(c=>({ cat:c, v:filtered.filter(e=>e.category===c).reduce((s,e)=>s+(Number(e.amount)||0),0) })).filter(x=>x.v>0);

  return (
    <div style={S.content}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={S.sectionTitle}>지출 일지</div>
        <button style={{ ...S.btnSmall(C.green), padding:"8px 14px" }} onClick={()=>setShowForm(true)}>➕ 지출 추가</button>
      </div>
      <div style={S.searchRow}>
        <input style={S.searchInput} placeholder="🔍 항목·내용 검색" value={search} onChange={e=>setSearch(e.target.value)} />
        <input type="month" style={{ ...S.searchInput,flex:"0 0 auto",width:130 }} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
        <select style={{ ...S.searchInput,flex:"0 0 auto" }} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="">전체</option>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
      </div>
      <div style={{ ...S.statCard(C.red), marginBottom:10 }}>
        <div style={S.statLabel}>총 지출</div>
        <div style={S.statValue(C.red)}>{fmt.money(total)}</div>
        <div style={S.statSub}>{filtered.length}건</div>
      </div>
      {byCat.length>0&&(
        <div style={{ ...S.card,marginBottom:12 }}>
          <div style={S.cardTitle}>항목별</div>
          {byCat.map(({cat,v})=>(
            <div key={cat} style={{ display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:13 }}>
              <span style={{ color:C.text2 }}>{cat}</span>
              <span style={{ color:C.red,fontWeight:700 }}>{fmt.money(v)}</span>
            </div>
          ))}
        </div>
      )}
      {filtered.map(e=>(
        <div key={e.id} style={S.listItem}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                <span style={S.badge(C.yellow)}>{e.category}</span>
                <span style={{ fontSize:11,color:C.text3 }}>{fmt.date(e.date)}</span>
              </div>
              <div style={{ fontSize:13,color:C.text,fontWeight:600 }}>{e.desc||"-"}</div>
              {e.memo&&<div style={{ fontSize:11,color:C.text3,marginTop:2 }}>{e.memo}</div>}
            </div>
            <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6 }}>
              <div style={{ fontSize:15,fontWeight:800,color:C.red }}>{fmt.money(e.amount)}</div>
              <div style={{ display:"flex",gap:6 }}>
                <button style={{ ...S.btnSmall(C.blue),padding:"4px 10px",fontSize:11 }} onClick={()=>setEditTarget(e)}>수정</button>
                <button style={{ ...S.btnDanger,padding:"4px 10px",fontSize:11 }} onClick={()=>setConfirmDelete(e.id)}>삭제</button>
              </div>
            </div>
          </div>
          {confirmDelete===e.id&&(
            <div style={{ marginTop:10,display:"flex",gap:8 }}>
              <button style={{ ...S.btnSecondary,flex:1,padding:"8px" }} onClick={()=>setConfirmDelete(null)}>취소</button>
              <button style={{ flex:1,padding:"8px",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:10,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer" }}
                onClick={()=>handleDelete(e.id)}>삭제 확인</button>
            </div>
          )}
        </div>
      ))}
      {filtered.length===0&&<div style={{ color:C.text4,textAlign:"center",padding:32,fontSize:13 }}>조회된 지출이 없습니다</div>}
      {(showForm||editTarget)&&<ExpenseModal expense={editTarget} onClose={()=>{ setShowForm(false); setEditTarget(null); }}
        onSaved={()=>{ setShowForm(false); setEditTarget(null); }} />}
    </div>
  );
}
