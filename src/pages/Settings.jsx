import { useState, useEffect } from "react";
import { doc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

export default function Settings({ user, profile, onProfileUpdate, onLogout }) {
  const [form, setForm] = useState({ name:profile.name, phone:profile.phone, companyName:profile.companyName||"" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [equipList, setEquipList] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    const q1 = query(collection(db,"clients"),orderBy("usedCount","desc"));
    const u1 = onSnapshot(q1,snap=>setClients(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    const q2 = query(collection(db,"equipment"),orderBy("usedCount","desc"));
    const u2 = onSnapshot(q2,snap=>setEquipList(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    return ()=>{ u1(); u2(); };
  },[]);

  const handleSaveProfile = async () => {
    if (!form.name.trim()) { alert("이름을 입력해주세요."); return; }
    if (!form.phone.trim()) { alert("전화번호를 입력해주세요."); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db,"users",user.uid), {
        name:form.name.trim(), phone:form.phone.trim(),
        companyName:form.companyName.trim(), updatedAt:new Date().toISOString()
      });
      onProfileUpdate({ name:form.name.trim(), phone:form.phone.trim(), companyName:form.companyName.trim() });
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e) { alert("저장 오류: "+e.message); }
    setSaving(false);
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    try { await deleteDoc(doc(db,"clients",id)); } catch(e) { alert("오류: "+e.message); }
  };
  const handleDeleteEquip = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    try { await deleteDoc(doc(db,"equipment",id)); } catch(e) { alert("오류: "+e.message); }
  };

  const ROLE_LABEL = { admin:"관리자", shared:"공유 사용자", private:"개인 사용자", pending:"승인 대기" };
  const ROLE_COLOR = { admin:C.green, shared:C.blue, private:"#8b5cf6", pending:C.yellow };
  const myRole = profile.role || "pending";

  const tabs = [["profile","👤 프로필"],["clients","🏢 발주업체"],["equip","🛠 장비"],["info","ℹ️ 정보"]];

  return (
    <div style={S.content}>
      <div style={S.sectionTitle}>설정</div>

      {/* 내 권한 표시 */}
      <div style={{ ...S.card, marginBottom:12, border:`1px solid ${(ROLE_COLOR[myRole]||C.border)}30` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, color:C.text2 }}>내 권한</div>
          <span style={S.badge(ROLE_COLOR[myRole]||C.text3)}>{ROLE_LABEL[myRole]||myRole}</span>
        </div>
        <div style={{ fontSize:11, color:C.text4, marginTop:4 }}>
          {myRole==="shared" && "전체 작업일지를 함께 조회할 수 있습니다"}
          {myRole==="private" && "본인이 입력한 데이터만 조회됩니다"}
          {myRole==="admin" && "모든 데이터와 사용자 관리 권한이 있습니다"}
          {myRole==="pending" && "관리자 승인을 기다리고 있습니다"}
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto" }}>
        {tabs.map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{ padding:"7px 14px", borderRadius:20, fontSize:12, cursor:"pointer",
              border:"1px solid", whiteSpace:"nowrap",
              background:activeTab===id?`${C.blue}25`:"rgba(255,255,255,0.04)",
              borderColor:activeTab===id?C.blue:C.border,
              color:activeTab===id?C.blue:C.text3, fontWeight:activeTab===id?700:400 }}>
            {label}
          </button>
        ))}
      </div>

      {/* 프로필 */}
      {activeTab==="profile"&&(
        <div style={S.card}>
          <div style={S.cardTitle}>내 프로필</div>
          <div style={{ fontSize:12,color:C.text4,marginBottom:10 }}>📧 {user.email}</div>
          {saved&&<div style={S.toast(true)}>✅ 저장되었습니다</div>}
          <div style={S.fg}><label style={S.label}>이름 *</label>
            <input style={S.input} value={form.name} onChange={e=>set("name",e.target.value)} /></div>
          <div style={S.fg}><label style={S.label}>전화번호 *</label>
            <input style={S.input} type="tel" value={form.phone}
              onChange={e=>set("phone",e.target.value.replace(/[^0-9]/g,""))} maxLength={11} /></div>
          <div style={S.fg}><label style={S.label}>업체명</label>
            <input style={S.input} value={form.companyName} onChange={e=>set("companyName",e.target.value)} /></div>
          <button style={{ ...S.btnPrimary,opacity:saving?0.6:1 }} onClick={handleSaveProfile} disabled={saving}>
            {saving?"저장 중...":"저장"}</button>
          <div style={{ height:12 }} />
          <button style={{ ...S.btnSecondary,color:C.red,borderColor:"rgba(239,68,68,0.3)" }} onClick={onLogout}>
            🚪 로그아웃</button>
        </div>
      )}

      {/* 발주업체 */}
      {activeTab==="clients"&&(
        <div style={S.card}>
          <div style={S.cardTitle}>발주업체 목록 (사용횟수 순)</div>
          <div style={{ fontSize:11,color:C.text4,marginBottom:10 }}>작업 입력 시 자동으로 추가됩니다</div>
          {clients.length===0&&<div style={{ color:C.text4,fontSize:13,textAlign:"center",padding:16 }}>아직 없음</div>}
          {clients.map(c=>(
            <div key={c.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"9px 0",borderBottom:`1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize:13,color:C.text }}>{c.name}</div>
                <div style={{ fontSize:10,color:C.text4 }}>사용 {c.usedCount||0}회</div>
              </div>
              <button style={{ ...S.btnDanger,padding:"4px 10px",fontSize:11 }}
                onClick={()=>handleDeleteClient(c.id)}>삭제</button>
            </div>
          ))}
        </div>
      )}

      {/* 장비 */}
      {activeTab==="equip"&&(
        <div style={S.card}>
          <div style={S.cardTitle}>장비 목록 (사용횟수 순)</div>
          <div style={{ fontSize:11,color:C.text4,marginBottom:10 }}>작업 입력 시 자동으로 추가됩니다</div>
          {equipList.length===0&&<div style={{ color:C.text4,fontSize:13,textAlign:"center",padding:16 }}>아직 없음</div>}
          {equipList.map(e=>(
            <div key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"9px 0",borderBottom:`1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize:13,color:C.text }}>{e.name}</div>
                <div style={{ fontSize:10,color:C.text4 }}>사용 {e.usedCount||0}회</div>
              </div>
              <button style={{ ...S.btnDanger,padding:"4px 10px",fontSize:11 }}
                onClick={()=>handleDeleteEquip(e.id)}>삭제</button>
            </div>
          ))}
        </div>
      )}

      {/* 정보 */}
      {activeTab==="info"&&(
        <div style={S.card}>
          <div style={S.cardTitle}>시스템 정보</div>
          <div style={{ fontSize:12,color:C.text3,lineHeight:1.9 }}>
            <div>📱 배관사무소 작업일지 v1.0</div>
            <div>🗄 Firebase Firestore (데이터베이스)</div>
            <div>🔐 Firebase Authentication (로그인)</div>
            <div>📸 Firebase Storage (사진·영상)</div>
            <div>🌐 GitHub Pages (호스팅)</div>
          </div>
        </div>
      )}
    </div>
  );
}
