export const C = {
  bg: "#0f1117",
  bg2: "#1a1f2e",
  bg3: "#242938",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.14)",
  text: "#e8eaf0",
  text2: "#9ca3af",
  text3: "#6b7280",
  text4: "#4b5563",
  blue: "#3b82f6",
  blueDark: "#1d4ed8",
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
};

export const PAY_COLOR = { cash: C.green, card: C.blue, credit: C.yellow };
export const PAY_LABEL = { cash: "현금", card: "카드", credit: "외상" };

export const S = {
  app: { fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:C.bg, minHeight:"100vh", color:C.text, maxWidth:480, margin:"0 auto", position:"relative" },
  header: { position:"sticky", top:0, zIndex:100, background:"rgba(15,17,23,0.97)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  nav: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"rgba(15,17,23,0.98)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100 },
  navBtn: (a) => ({ flex:1, padding:"10px 4px 14px", border:"none", background:"transparent", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:a?C.blue:C.text4, fontSize:10, fontWeight:a?700:400 }),
  content: { padding:"16px 16px 90px" },
  card: { background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:12 },
  cardTitle: { fontSize:11, fontWeight:700, color:C.text3, marginBottom:12, textTransform:"uppercase", letterSpacing:"0.8px" },
  fg: { marginBottom:14 },
  label: { fontSize:12, color:C.text2, marginBottom:6, display:"block", fontWeight:600 },
  input: { width:"100%", padding:"10px 12px", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border2}`, borderRadius:10, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" },
  inputFocus: { borderColor: C.blue },
  select: { width:"100%", padding:"10px 12px", background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" },
  textarea: { width:"100%", padding:"10px 12px", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border2}`, borderRadius:10, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box", minHeight:80, resize:"vertical" },
  btnPrimary: { width:"100%", padding:"13px", background:`linear-gradient(135deg,${C.blue},${C.blueDark})`, border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:`0 4px 16px ${C.blue}40` },
  btnSecondary: { width:"100%", padding:"11px", background:"rgba(255,255,255,0.07)", border:`1px solid ${C.border2}`, borderRadius:12, color:C.text, fontSize:14, fontWeight:600, cursor:"pointer" },
  btnDanger: { padding:"8px 14px", background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, color:C.red, fontSize:13, cursor:"pointer" },
  btnSmall: (c=C.blue) => ({ padding:"7px 14px", background:`${c}20`, border:`1px solid ${c}40`, borderRadius:8, color:c, fontSize:13, fontWeight:600, cursor:"pointer" }),
  badge: (c) => ({ display:"inline-block", padding:"2px 8px", background:`${c}20`, border:`1px solid ${c}40`, borderRadius:6, fontSize:11, color:c, fontWeight:600 }),
  listItem: { background:"rgba(255,255,255,0.03)", border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:8, cursor:"pointer" },
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" },
  modal: { background:C.bg2, borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, padding:20, maxHeight:"92vh", overflowY:"auto" },
  searchRow: { display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" },
  searchInput: { flex:1, padding:"9px 12px", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border2}`, borderRadius:10, color:C.text, fontSize:13, outline:"none" },
  payRow: { display:"flex", gap:8 },
  payBtn: (a,c) => ({ flex:1, padding:"9px", background:a?`${c}25`:"rgba(255,255,255,0.04)", border:`1px solid ${a?c:C.border2}`, borderRadius:8, color:a?c:C.text3, fontSize:13, fontWeight:a?700:400, cursor:"pointer" }),
  toast: (ok=true) => ({ background:ok?"rgba(16,185,129,0.15)":"rgba(239,68,68,0.15)", border:`1px solid ${ok?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`, borderRadius:10, padding:"10px 14px", textAlign:"center", marginBottom:12, color:ok?C.green:C.red, fontSize:13, fontWeight:700 }),
  sectionTitle: { fontSize:20, fontWeight:800, color:"#fff", marginBottom:16, letterSpacing:"-0.3px" },
  divider: { height:1, background:C.border, margin:"14px 0" },
  mediaGrid: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 },
  mediaThumb: { aspectRatio:"1", borderRadius:8, objectFit:"cover", width:"100%", cursor:"pointer", background:"rgba(255,255,255,0.06)" },
  progressFill: (p) => ({ height:"100%", background:`linear-gradient(90deg,${C.blue},${C.green})`, borderRadius:3, width:`${p}%`, transition:"width 0.3s" }),
  tagBtn: (sel) => ({ padding:"6px 12px", borderRadius:20, fontSize:12, cursor:"pointer", border:"1px solid", whiteSpace:"nowrap",
    background:sel?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.04)",
    borderColor:sel?C.blue:"rgba(255,255,255,0.1)",
    color:sel?C.blue:C.text3, fontWeight:sel?700:400 }),
};

export const fmt = {
  money: (n) => n ? Number(n).toLocaleString("ko-KR")+"원" : "0원",
  date: (d) => { if(!d) return "-"; const dt=new Date(d); return `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`; },
  today: () => new Date().toISOString().split("T")[0],
  monthKey: (d) => d?d.slice(0,7):"",
  monthLabel: (ym) => ym?`${ym.slice(0,4)}년 ${Number(ym.slice(5,7))}월`:"",
  phone: (p) => p?p.replace(/(\d{3})(\d{3,4})(\d{4})/,"$1-$2-$3"):"-",
  fileSize: (b) => b<1048576?`${(b/1024).toFixed(0)}KB`:`${(b/1048576).toFixed(1)}MB`,
};

// 추가 스타일
S.loginBtn = { width:"100%", padding:"14px 24px", background:"#fff", color:"#1f2937", border:"none", borderRadius:12, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, boxShadow:"0 4px 24px rgba(0,0,0,0.4)", transition:"transform 0.15s" };
S.statCard = (c) => ({ background:`linear-gradient(135deg,${c}20 0%,${c}0a 100%)`, border:`1px solid ${c}30`, borderRadius:14, padding:14 });
S.statLabel = { fontSize:11, color:C.text3, marginBottom:4 };
S.statValue = (c) => ({ fontSize:20, fontWeight:800, color:c });
S.statSub = { fontSize:10, color:C.text4, marginTop:2 };
S.uploadZone = { border:"2px dashed rgba(255,255,255,0.12)", borderRadius:12, padding:18, textAlign:"center", cursor:"pointer" };
S.uploadZoneActive = { border:`2px dashed ${C.blue}`, background:`${C.blue}08` };
