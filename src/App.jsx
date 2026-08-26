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
import EstimateForm from "./components/EstimateForm";
import DetailedEstimateForm from "./components/DetailedEstimateForm";
import ReceiptForm from "./components/ReceiptForm";
import EstimatePicker from "./components/EstimatePicker";

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
    { id:"estimate",  icon:"📋", label:"견적서" },
    { id:"revenue",   icon:"💰", label:"매출" },
    { id:"expense",   icon:"📉", label:"지출" },
    { id:"settings",  icon:"⚙️", label:"설정" },
  ];
  if (isAdmin) base.push({ id:"admin", icon:"👑", label:"관리" });
  return base;
};

const TITLES = {
  dashboard:"배관사무소", work:"작업입력", estimate:"견적서", revenue:"매출일지",
  expense:"지출일지", settings:"설정", admin:"관리자"
};

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [needProfile, setNeedProfile] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [estimateKind, setEstimateKind] = useState(null); // null(선택화면) | "simple" | "detailed"
  const [works, setWorks] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const userRole = profile?.role;
  const userTeamId = profile?.teamId;
  const isApproved = isAdmin || (profile?.approved === true && userRole !== "blocked");
  const isPending = profile && !isAdmin && (!userRole || userRole === "pending");
  const isBlocked = profile && !isAdmin && userRole === "blocked";
  // 세부견적서 사용 권한: 관리자는 항상 허용, 그 외는 관리자가 개별로 켜준 경우에만 허용(기본값 false)
  const canUseDetailedEstimate = isAdmin || profile?.canUseDetailedEstimate === true;
  // 간이영수증 사용 권한: 세부견적서와 동일한 방식(관리자가 개별로 켜줌, 기본값 false)
  const canUseReceipt = isAdmin || profile?.canUseReceipt === true;

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
  // 주의: team(공유 사용자 포함)/private은 where만 쓰고 orderBy를 클라이언트에서 처리한다.
  // (where + orderBy를 같은 쿼리에 같이 쓰면 Firestore 복합 인덱스가 필요한데,
  //  인덱스가 생성되어 있지 않으면 쿼리가 조용히 실패해 목록이 비어 보이는 문제가 있었음)
  // "공유(shared)" 역할도 teamId가 있으면 team과 동일하게 그 팀끼리만 데이터를 공유한다.
  // (예전에는 shared가 무조건 전체 조회였는데, 이러면 다른 개인/팀 사용자의 데이터까지 보이는
  //  심각한 분리 버그가 있었음 — 이제는 shared/team 모두 teamId 기준으로 동일하게 분리됨)
  useEffect(() => {
    if (!user || !isApproved) return;
    let q;
    const hasTeamFilter = (userRole === "team" || userRole === "shared") && !!userTeamId;
    if (isAdmin) {
      // 최고관리자만 예외적으로 전체 조회
      q = query(collection(db,"works"), orderBy("createdAt","desc"));
      return onSnapshot(q, snap => setWorks(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    } else if (hasTeamFilter) {
      q = query(collection(db,"works"), where("teamId","==",userTeamId));
    } else {
      // private(개인), 또는 team/shared인데 아직 teamId가 지정되지 않은 경우(콘솔 마이그레이션 전):
      // 본인이 작성한 작업만. createdByUid(신규 데이터) 우선 매칭하고,
      // createdByUid가 없는 과거 데이터는 workerName으로도 보조 매칭해 누락을 방지한다.
      q = query(collection(db,"works"));
    }
    return onSnapshot(q, snap => {
      let list = snap.docs.map(d=>({ id:d.id,...d.data() }));
      if (hasTeamFilter) {
        // teamId where는 이미 서버에서 필터링됨 (위에서 쿼리에 포함)
      } else {
        // 본인 데이터만 클라이언트에서 한 번 더 안전하게 필터링
        // (teamId 미지정 상태에서 전체를 보여주면 다른 사람 데이터가 새는 위험한 버그가 되므로,
        //  "아직 아무것도 안 보임"이 "남의 데이터가 다 보임"보다 항상 안전하다.)
        list = list.filter(w =>
          (profile?.uid && w.createdByUid === profile.uid) ||
          (!w.createdByUid && w.workerName === profile?.name)
        );
      }
      list.sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
      setWorks(list);
    });
  }, [user, isApproved, userRole, userTeamId, profile?.name, profile?.uid, isAdmin]); // eslint-disable-line

  // expenses 실시간 (works와 동일한 원칙 적용)
  useEffect(() => {
    if (!user || !isApproved) return;
    let q;
    const hasTeamFilter = (userRole === "team" || userRole === "shared") && !!userTeamId;
    if (isAdmin) {
      q = query(collection(db,"expenses"), orderBy("createdAt","desc"));
      return onSnapshot(q, snap => setExpenses(snap.docs.map(d=>({ id:d.id,...d.data() }))));
    } else if (hasTeamFilter) {
      q = query(collection(db,"expenses"), where("teamId","==",userTeamId));
    } else {
      q = query(collection(db,"expenses"));
    }
    return onSnapshot(q, snap => {
      let list = snap.docs.map(d=>({ id:d.id,...d.data() }));
      if (!hasTeamFilter) {
        list = list.filter(e =>
          (profile?.uid && e.createdByUid === profile.uid) ||
          (!e.createdByUid && e.workerName === profile?.name)
        );
      }
      list.sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
      setExpenses(list);
    });
  }, [user, isApproved, userRole, userTeamId, profile?.name, profile?.uid, isAdmin]); // eslint-disable-line

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
      {tab==="estimate"  && estimateKind===null && (
        <EstimatePicker onSelect={setEstimateKind} canUseDetailed={canUseDetailedEstimate} canUseReceipt={canUseReceipt} />
      )}
      {tab==="estimate"  && estimateKind==="simple" && (
        <EstimateForm profile={profile} userRole={userRole} userTeamId={userTeamId} isAdmin={isAdmin}
          onBack={()=>setEstimateKind(null)} />
      )}
      {tab==="estimate"  && estimateKind==="detailed" && canUseDetailedEstimate && (
        <DetailedEstimateForm profile={profile} onBack={()=>setEstimateKind(null)} />
      )}
      {tab==="estimate"  && estimateKind==="receipt" && canUseReceipt && (
        <ReceiptForm profile={profile} onBack={()=>setEstimateKind(null)} />
      )}
      {tab==="revenue"   && <WorkList works={works} profile={profile} />}
      {tab==="expense"   && <ExpenseList expenses={expenses} userRole={userRole} userTeamId={userTeamId} profile={profile} />}
      {tab==="settings"  && <Settings user={user} profile={profile}
        onProfileUpdate={p=>setProfile(prev=>({...prev,...p}))} onLogout={handleLogout} />}
      {tab==="admin" && isAdmin && <AdminPage user={user} />}

      <nav style={S.nav}>
        {navItems.map(({id,icon,label})=>(
          <button key={id} style={S.navBtn(tab===id)} onClick={()=>{ setTab(id); if (id==="estimate") setEstimateKind(null); }}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
