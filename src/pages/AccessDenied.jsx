import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { C, S } from "../styles/theme";

export default function AccessDenied({ user, role }) {
  const isPending = !role || role === "pending";
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:`linear-gradient(160deg,${C.bg} 0%,${C.bg2} 50%,${C.bg} 100%)`,
      padding:32, textAlign:"center" }}>
      <div style={{ fontSize:56, marginBottom:16 }}>{isPending ? "⏳" : "🚫"}</div>
      <div style={{ fontSize:22, fontWeight:800, color:"#fff", marginBottom:8 }}>
        {isPending ? "승인 대기 중" : "접근이 차단되었습니다"}
      </div>
      <div style={{ fontSize:13, color:C.text3, marginBottom:4 }}>
        {isPending
          ? "관리자가 계정을 승인하면 사용할 수 있습니다."
          : "관리자에게 문의해주세요."}
      </div>
      <div style={{ fontSize:12, color:C.text4, marginBottom:32 }}>
        {user?.email}
      </div>
      {isPending && (
        <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)",
          borderRadius:12, padding:"12px 20px", marginBottom:24, maxWidth:300 }}>
          <div style={{ fontSize:12, color:C.yellow, lineHeight:1.7 }}>
            관리자(junbsd@gmail.com)에게<br/>
            승인을 요청해주세요.
          </div>
        </div>
      )}
      <button style={{ ...S.btnSecondary, maxWidth:200,
        color:C.red, borderColor:"rgba(239,68,68,0.3)" }}
        onClick={() => signOut(auth)}>
        🚪 로그아웃
      </button>
    </div>
  );
}
