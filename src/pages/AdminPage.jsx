import { useState, useEffect } from "react";
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, addDoc, setDoc, getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const ADMIN_EMAIL = "junbsd@gmail.com";

const ROLE_LABEL = {
  pending:  { label:"승인 대기",   color:"#f59e0b" },
  shared:   { label:"공유 사용자", color:"#3b82f6" },
  team:     { label:"팀 사용자",   color:"#8b5cf6" },
  private:  { label:"개인 사용자", color:"#10b981" },
  blocked:  { label:"차단",        color:"#ef4444" },
  admin:    { label:"관리자",      color:"#10b981" },
};

// ── 팀 관리 탭 ────────────────────────────────────────────────
function TeamManager({ teams, users }) {
  const [newTeamName, setNewTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const handleAddTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "teams"), {
        name, createdAt: new Date().toISOString(), memberCount: 0
      });
      setNewTeamName("");
    } catch(e) { alert("오류: " + e.message); }
    setSaving(false);
  };

  const handleRenameTeam = async (id) => {
    if (!editName.trim()) return;
    try {
      await updateDoc(doc(db, "teams", id), { name: editName.trim() });
      setEditingId(null);
    } catch(e) { alert("오류: " + e.message); }
  };

  const handleDeleteTeam = async (id, name) => {
    // 해당 팀 멤버 확인
    const members = users.filter(u => u.teamId === id);
    if (members.length > 0) {
      if (!window.confirm(`"${name}" 팀에 멤버 ${members.length}명이 있습니다.\n삭제하면 해당 멤버들이 승인대기 상태로 변경됩니다. 계속할까요?`)) return;
      // 팀원들 role을 pending으로 변경
      for (const m of members) {
        await updateDoc(doc(db, "users", m.id), { role:"pending", teamId:null, approved:false });
      }
    } else {
      if (!window.confirm(`"${name}" 팀을 삭제할까요?`)) return;
    }
    try { await deleteDoc(doc(db, "teams", id)); } catch(e) { alert("오류: " + e.message); }
  };

  return (
    <div>
      {/* 팀 추가 */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <input style={{ ...S.input, flex:1 }} placeholder="새 팀 이름 (예: A팀, 서울팀)"
          value={newTeamName} onChange={e=>setNewTeamName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleAddTeam()} />
        <button style={{ ...S.btnSmall(C.green), whiteSpace:"nowrap", opacity:saving?0.6:1 }}
          onClick={handleAddTeam} disabled={saving}>
          ➕ 팀 추가
        </button>
      </div>

      {teams.length === 0 && (
        <div style={{ textAlign:"center", padding:24, color:C.text4, fontSize:13 }}>
          아직 팀이 없습니다. 팀을 추가해주세요.
        </div>
      )}

      {teams.map(team => {
        const members = users.filter(u => u.teamId === team.id);
        return (
          <div key={team.id} style={{ ...S.card, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ flex:1 }}>
                {editingId === team.id ? (
                  <div style={{ display:"flex", gap:8 }}>
                    <input style={{ ...S.input, flex:1, padding:"6px 10px", fontSize:13 }}
                      value={editName} onChange={e=>setEditName(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&handleRenameTeam(team.id)} autoFocus />
                    <button style={S.btnSmall(C.green)} onClick={()=>handleRenameTeam(team.id)}>저장</button>
                    <button style={S.btnSmall(C.text3)} onClick={()=>setEditingId(null)}>취소</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{team.name}</div>
                    <span style={S.badge(C.purple)}>{members.length}명</span>
                  </div>
                )}
                <div style={{ fontSize:11, color:C.text4, marginTop:4 }}>
                  생성: {fmt.date(team.createdAt)}
                </div>
              </div>
              {editingId !== team.id && (
                <div style={{ display:"flex", gap:6 }}>
                  <button style={{ ...S.btnSmall(C.blue), padding:"5px 10px", fontSize:11 }}
                    onClick={()=>{ setEditingId(team.id); setEditName(team.name); }}>이름변경</button>
                  <button style={{ ...S.btnDanger, padding:"5px 10px", fontSize:11 }}
                    onClick={()=>handleDeleteTeam(team.id, team.name)}>삭제</button>
                </div>
              )}
            </div>
            {/* 팀 멤버 목록 */}
            {members.length > 0 && (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                <div style={{ fontSize:11, color:C.text3, marginBottom:6 }}>팀원</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {members.map(m => (
                    <span key={m.id} style={{ fontSize:12, padding:"4px 10px",
                      background:"rgba(139,92,246,0.15)", border:"1px solid rgba(139,92,246,0.3)",
                      borderRadius:8, color:"#a78bfa" }}>
                      {m.name} ({m.companyName||m.email})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 사용자 카드 ───────────────────────────────────────────────
function UserCard({ user, teams }) {
  const [showOptions, setShowOptions] = useState(false);
  const [changing, setChanging] = useState(false);
  const [selectedRole, setSelectedRole] = useState(user.role || "pending");
  const [selectedTeam, setSelectedTeam] = useState(user.teamId || "");
  const isAdmin = user.email === ADMIN_EMAIL;
  const role = ROLE_LABEL[user.role] || ROLE_LABEL.pending;
  const teamName = teams.find(t=>t.id===user.teamId)?.name;

  const handleSave = async () => {
    setChanging(true);
    try {
      const data = {
        role: selectedRole,
        approved: selectedRole !== "blocked" && selectedRole !== "pending",
        teamId: selectedRole === "team" ? selectedTeam : null,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "users", user.id), data);
      setShowOptions(false);
    } catch(e) { alert("변경 오류: " + e.message); }
    setChanging(false);
  };

  return (
    <div style={{ ...S.card, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>{user.name||"이름 없음"}</div>
            <span style={S.badge(role.color)}>{role.label}</span>
            {isAdmin && <span style={S.badge(C.green)}>최고관리자</span>}
            {teamName && <span style={S.badge(C.purple)}>📌 {teamName}</span>}
          </div>
          <div style={{ fontSize:12, color:C.text3 }}>📧 {user.email}</div>
          {user.phone && <div style={{ fontSize:12, color:C.text3 }}>📱 {fmt.phone(user.phone)}</div>}
          {user.companyName && <div style={{ fontSize:12, color:C.text3 }}>🏢 {user.companyName}</div>}
          <div style={{ fontSize:11, color:C.text4, marginTop:3 }}>가입: {fmt.date(user.createdAt)}</div>
        </div>
        {!isAdmin && (
          <button style={{ ...S.btnSmall(role.color), fontSize:12, whiteSpace:"nowrap" }}
            onClick={()=>setShowOptions(!showOptions)}>
            권한설정 {showOptions?"▲":"▼"}
          </button>
        )}
      </div>

      {/* 권한 설정 패널 */}
      {showOptions && !isAdmin && (
        <div style={{ marginTop:12, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
          <div style={{ fontSize:12, color:C.text2, marginBottom:10, fontWeight:700 }}>권한 선택</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
            {[
              { value:"shared",  label:"🌐 공유 사용자", desc:"전체 DB 공유 · 모든 데이터 함께 조회" },
              { value:"team",    label:"👥 팀 사용자",   desc:"같은 팀끼리만 데이터 공유" },
              { value:"private", label:"👤 개인 사용자", desc:"본인 데이터만 입력·조회" },
              { value:"blocked", label:"🚫 차단",        desc:"앱 접근 불가" },
            ].map(opt=>(
              <div key={opt.value} onClick={()=>setSelectedRole(opt.value)}
                style={{ padding:"10px 12px", borderRadius:10, cursor:"pointer",
                  background:selectedRole===opt.value?`${ROLE_LABEL[opt.value].color}18`:"rgba(255,255,255,0.03)",
                  border:`1px solid ${selectedRole===opt.value?ROLE_LABEL[opt.value].color+"50":C.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:ROLE_LABEL[opt.value].color }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:C.text4, marginTop:2 }}>{opt.desc}</div>
                  </div>
                  {selectedRole===opt.value && <span style={{ color:ROLE_LABEL[opt.value].color }}>✓</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 팀 선택 (팀 사용자 선택 시) */}
          {selectedRole === "team" && (
            <div style={{ marginBottom:12 }}>
              <label style={S.label}>팀 선택</label>
              {teams.length === 0 ? (
                <div style={{ fontSize:12, color:C.yellow, padding:8 }}>
                  ⚠️ 먼저 팀 관리 탭에서 팀을 추가해주세요
                </div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {teams.map(t=>(
                    <button key={t.id} onClick={()=>setSelectedTeam(t.id)}
                      style={{ ...S.tagBtn(selectedTeam===t.id), padding:"7px 14px" }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button style={{ ...S.btnPrimary, opacity:changing?0.6:1 }}
            onClick={handleSave} disabled={changing || (selectedRole==="team" && !selectedTeam)}>
            {changing ? "저장 중..." : "저장"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 메인 AdminPage ────────────────────────────────────────────
export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTab, setActiveTab] = useState("users");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const isAdmin = user.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;
    const u1 = onSnapshot(query(collection(db,"users"),orderBy("createdAt","desc")),
      snap => setUsers(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    const u2 = onSnapshot(query(collection(db,"teams"),orderBy("createdAt","asc")),
      snap => setTeams(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    return () => { u1(); u2(); };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div style={{ ...S.content, textAlign:"center", paddingTop:60 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🚫</div>
        <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>접근 권한 없음</div>
      </div>
    );
  }

  const pending = users.filter(u => !u.role || u.role === "pending");

  const filtered = users.filter(u => {
    const matchF = filter==="all" || u.role===filter || (!u.role&&filter==="pending");
    const s = search.toLowerCase();
    const matchS = !s || [u.name,u.email,u.companyName].some(v=>v?.toLowerCase().includes(s));
    return matchF && matchS;
  });

  const counts = {
    all:     users.length,
    pending: users.filter(u=>!u.role||u.role==="pending").length,
    shared:  users.filter(u=>u.role==="shared").length,
    team:    users.filter(u=>u.role==="team").length,
    private: users.filter(u=>u.role==="private").length,
    blocked: users.filter(u=>u.role==="blocked").length,
  };

  return (
    <div style={S.content}>
      <div style={S.sectionTitle}>👑 관리자</div>

      {/* 승인 대기 알림 */}
      {pending.length > 0 && (
        <div style={{ background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.3)",
          borderRadius:12, padding:"12px 16px", marginBottom:14,
          display:"flex", alignItems:"center", gap:10 }}
          onClick={()=>{ setActiveTab("users"); setFilter("pending"); }}>
          <span style={{ fontSize:20 }}>⏳</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.yellow }}>승인 대기 {pending.length}명</div>
            <div style={{ fontSize:11, color:C.text3 }}>탭하여 권한 설정</div>
          </div>
          <span style={{ marginLeft:"auto", color:C.yellow }}>→</span>
        </div>
      )}

      {/* 탭 */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["users",`👥 사용자 (${users.length})`],["teams",`🏷 팀 관리 (${teams.length})`]].map(([v,l])=>(
          <button key={v} onClick={()=>setActiveTab(v)}
            style={{ flex:1, padding:"9px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
              border:"1px solid",
              background:activeTab===v?`${C.blue}25`:"rgba(255,255,255,0.04)",
              borderColor:activeTab===v?C.blue:C.border,
              color:activeTab===v?C.blue:C.text3 }}>
            {l}
          </button>
        ))}
      </div>

      {/* 사용자 탭 */}
      {activeTab==="users" && (
        <>
          {/* 통계 */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:12 }}>
            {[["전체",counts.all,C.blue],["팀",counts.team,C.purple],["개인",counts.private,C.green],
              ["공유",counts.shared,C.blue],["대기",counts.pending,C.yellow],["차단",counts.blocked,C.red]].map(([l,v,c])=>(
              <div key={l} style={{ ...S.statCard(c), textAlign:"center", padding:8 }}>
                <div style={{ fontSize:17, fontWeight:800, color:c }}>{v}</div>
                <div style={{ fontSize:10, color:C.text3 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* 검색 */}
          <input style={{ ...S.searchInput, width:"100%", marginBottom:10 }}
            placeholder="🔍 이름·이메일·업체명 검색"
            value={search} onChange={e=>setSearch(e.target.value)} />

          {/* 필터 */}
          <div style={{ display:"flex", gap:5, marginBottom:14, overflowX:"auto" }}>
            {[["all","전체"],["pending","대기"],["shared","공유"],["team","팀"],["private","개인"],["blocked","차단"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, cursor:"pointer",
                  border:"1px solid", whiteSpace:"nowrap",
                  background:filter===v?`${C.blue}25`:"rgba(255,255,255,0.04)",
                  borderColor:filter===v?C.blue:C.border,
                  color:filter===v?C.blue:C.text3, fontWeight:filter===v?700:400 }}>
                {l}{counts[v]>0?` (${counts[v]})`:""}</button>
            ))}
          </div>

          {filtered.length===0 && (
            <div style={{ textAlign:"center", padding:32, color:C.text4, fontSize:13 }}>해당하는 사용자가 없습니다</div>
          )}
          {filtered.map(u=><UserCard key={u.id} user={u} teams={teams} />)}
        </>
      )}

      {/* 팀 관리 탭 */}
      {activeTab==="teams" && <TeamManager teams={teams} users={users} />}
    </div>
  );
}
