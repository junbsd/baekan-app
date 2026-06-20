import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import { S, C } from "./styles/theme";
import ProfileSetup from "./components/ProfileSetup";
import Dashboard from "./pages/Dashboard";
import WorkForm from "./pages/WorkForm";
import WorkList from "./pages/WorkList";
import ExpenseList from "./pages/ExpenseList";
import Settings from "./pages/Settings";
import AdminPage from "./pages/AdminPage";
import AccessDenied from "./pages/AccessDenied";

const ADMIN_EMAIL = "junbsd@gmail.com";

function Loading() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔧</div>
        <div style={{ fontSize:14, color:C.text3 }}>로딩 중...</div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleLogin = async () => {
    setLoading(true); setError("");
    try { await signInWithPopup(auth, googleProvider); }
    catch(e) { setError("로그인 오류. 다시 시도해주세요."); setLoading(false); }
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:`linear-gradient(160deg,${C.bg} 0%,${C.bg2} 50%,${C.bg} 100%)`, padding:32 }}>
      <div style={{ fontSize:60, marginBottom:10 }}>🔧</div>
      <div style={{ fontSize:30, fontWeight:800, color:"#fff", letterSpacing:"-0.5px", marginBottom:4 }}>배관사무소</div>
      <div style={{ fontSize:13, color:C.text4, marginBottom:48 }}>작업일지 · 매출 · 지출 관리</div>
      <button style={{ ...S.loginBtn, width:"100%", maxWidth:360 }} onClick={handleLogin} disabled={loading}>
        <img src="https://www.google.com/favicon.ico" width={18} height={18} alt="G" />
        {loading ? "로그인 중..." : "Google 계정으로 로그인"}
      </button>
      {error && <div style={{ color:C.red, fontSize:12, marginTop:12 }}>{error}</div>}
    </div>
  );
}

const getNavItems = (isAdmin) => {
  const base = [
    { id:"dashboard", icon:"📊", label:"대시보드" },
    { id:"work",      icon:"🔧", label:"작업입력" },
    { id:"revenue",   icon:"💰", label:"매출" },
    { id:"expense",   icon:"📉", label:"지출" },
    { id:"settings",  icon:"⚙️", label:"설정" },
  ];
  if (isAdmin) base.push({ id:"admin", icon:"👑", label:"관리" });
  return base;
};

const TITLES = {
  dashboard:"배관사무소", work:"작업입력", revenue:"매출일지",
  expense:"지출일지", settings:"설정", admin:"관리자"
};

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [needProfile, setNeedProfile] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [works, setWorks] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const userRole = profile?.role;
  const userTeamId = profile?.teamId;
  const isApproved = isAdmin || (profile?.approved === true && userRole !== "blocked");
  const isPending = profile && !isAdmin && (!userRole || userRole === "pending");
  const isBlocked = profile && !isAdmin && userRole === "blocked";

  // Auth 감지
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db,"users",u.uid));
        if (snap.exists()) { setProfile(snap.data()); setNeedProfile(false); }
        else setNeedProfile(true);
      } else {
        setProfile(null); setNeedProfile(false);
      }
      setAuthLoading(false);
    });
  }, []);

  // 프로필 실시간 (권한 변경 즉시 반영)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db,"users",user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
  }, [user]);

  // works 실시간 — 역할별 필터
  useEffect(() => {
    if (!user || !isApproved) return;
    let q;
    if (isAdmin || userRole === "shared") {
      q = query(collection(db,"works"), orderBy("createdAt","desc"));
    } else if (userRole === "team" && userTeamId) {
      q = query(collection(db,"works"),
        where("teamId","==",userTeamId),
        orderBy("createdAt","desc"));
    } else {
      // private
      q = query(collection(db,"works"),
        where("workerName","==",profile?.name||""),
        orderBy("createdAt","desc"));
    }
    return onSnapshot(q, snap => setWorks(snap.docs.map(d=>({ id:d.id,...d.data() }))));
  }, [user, isApproved, userRole, userTeamId, profile?.name]); // eslint-disable-line

  // expenses 실시간
  useEffect(() => {
    if (!user || !isApproved) return;
    let q;
    if (isAdmin || userRole === "shared") {
      q = query(collection(db,"expenses"), orderBy("createdAt","desc"));
    } else if (userRole === "team" && userTeamId) {
      q = query(collection(db,"expenses"),
        where("teamId","==",userTeamId),
        orderBy("createdAt","desc"));
    } else {
      q = query(collection(db,"expenses"),
        where("workerName","==",profile?.name||""),
        orderBy("createdAt","desc"));
    }
    return onSnapshot(q, snap => setExpenses(snap.docs.map(d=>({ id:d.id,...d.data() }))));
  }, [user, isApproved, userRole, userTeamId, profile?.name]); // eslint-disable-line

  const handleProfileSave = (p) => { setProfile(p); setNeedProfile(false); };
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null); setProfile(null); setWorks([]); setExpenses([]);
  };

  if (authLoading) return <div style={S.app}><Loading /></div>;
  if (!user) return <div style={S.app}><LoginScreen /></div>;
  if (needProfile) return <div style={S.app}><ProfileSetup user={user} onComplete={handleProfileSave} /></div>;
  if (!profile) return <div style={S.app}><Loading /></div>;
  if (isBlocked || isPending) return <div style={S.app}><AccessDenied user={user} role={userRole} /></div>;

  const navItems = getNavItems(isAdmin);

  // 역할 배지
  const roleBadge = () => {
    if (isAdmin) return { label:"관리자", color:C.green };
    if (userRole==="team") return { label:profile?.teamName||"팀", color:C.purple };
    if (userRole==="private") return { label:"개인", color:C.green };
    if (userRole==="shared") return { label:"공유", color:C.blue };
    return null;
  };
  const badge = roleBadge();

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>🔧 {TITLES[tab]}</div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {badge && (
            <span style={{ fontSize:10, background:`${badge.color}25`,
              border:`1px solid ${badge.color}50`, borderRadius:6,
              padding:"2px 6px", color:badge.color, fontWeight:700 }}>{badge.label}</span>
          )}
          <div style={{ fontSize:12, color:C.text4 }}>👷 {profile.name}</div>
        </div>
      </div>

      {tab==="dashboard" && <Dashboard works={works} expenses={expenses} profile={profile} onTabChange={setTab} />}
      {tab==="work"      && <WorkForm profile={profile} userRole={userRole} userTeamId={userTeamId} onSaved={()=>setTab("dashboard")} />}
      {tab==="revenue"   && <WorkList works={works} profile={profile} />}
      {tab==="expense"   && <ExpenseList expenses={expenses} userRole={userRole} userTeamId={userTeamId} profile={profile} />}
      {tab==="settings"  && <Settings user={user} profile={profile}
        onProfileUpdate={p=>setProfile(prev=>({...prev,...p}))} onLogout={handleLogout} />}
      {tab==="admin" && isAdmin && <AdminPage user={user} />}

      <nav style={S.nav}>
        {navItems.map(({id,icon,label})=>(
          <button key={id} style={S.navBtn(tab===id)} onClick={()=>setTab(id)}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
