import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { S, C } from "../styles/theme";

const ADMIN_EMAIL = "junbsd@gmail.com";

export default function ProfileSetup({ user, onComplete }) {
  const [form, setForm] = useState({ name:"", phone:"", companyName:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const isAdmin = user.email === ADMIN_EMAIL;

  const handleSave = async () => {
    if (!form.name.trim()) { setError("이름을 입력해주세요."); return; }
    if (!form.phone.trim()) { setError("전화번호를 입력해주세요."); return; }
    setSaving(true);
    try {
      const userData = {
        uid: user.uid,
        email: user.email,
        name: form.name.trim(),
        phone: form.phone.trim(),
        companyName: form.companyName.trim(),
        // 관리자는 바로 admin, 나머지는 pending
        role: isAdmin ? "admin" : "pending",
        approved: isAdmin ? true : false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db,"users",user.uid), userData);
      onComplete(userData);
    } catch(e) { setError("저장 중 오류가 발생했습니다."); }
    setSaving(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", justifyContent:"center",
      background:`linear-gradient(160deg,${C.bg} 0%,${C.bg2} 50%,${C.bg} 100%)`, padding:24 }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>{isAdmin ? "👑" : "👷"}</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#fff", marginBottom:4 }}>
          {isAdmin ? "관리자 계정 설정" : "처음 오셨군요!"}
        </div>
        <div style={{ fontSize:13, color:C.text3 }}>
          {isAdmin ? "관리자 정보를 입력해주세요" : "작업일지에 표시될 정보를 입력해주세요"}
        </div>
        <div style={{ fontSize:12, color:C.text4, marginTop:4 }}>{user.email}</div>
        {!isAdmin && (
          <div style={{ marginTop:10, background:"rgba(245,158,11,0.1)",
            border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"8px 14px" }}>
            <div style={{ fontSize:11, color:C.yellow }}>
              입력 후 관리자 승인을 받아야 사용할 수 있습니다
            </div>
          </div>
        )}
      </div>
      <div style={S.card}>
        {error && <div style={S.toast(false)}>{error}</div>}
        <div style={S.fg}>
          <label style={S.label}>이름 *</label>
          <input style={S.input} placeholder="예: 홍길동" value={form.name}
            onChange={e=>set("name",e.target.value)} autoFocus />
        </div>
        <div style={S.fg}>
          <label style={S.label}>전화번호 *</label>
          <input style={S.input} placeholder="예: 01012345678" type="tel" value={form.phone}
            onChange={e=>set("phone",e.target.value.replace(/[^0-9]/g,""))} maxLength={11} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>업체명 (선택)</label>
          <input style={S.input} placeholder="예: 홍길동배관" value={form.companyName}
            onChange={e=>set("companyName",e.target.value)} />
          <div style={{ fontSize:11,color:C.text4,marginTop:4 }}>작업보고서에 표시되는 본인 업체명</div>
        </div>
        <button style={{ ...S.btnPrimary,opacity:saving?0.6:1 }} onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장하고 시작하기"}
        </button>
      </div>
    </div>
  );
}
