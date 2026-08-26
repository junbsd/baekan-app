import { S, C } from "../styles/theme";

// 견적서 탭 진입 시 "간이견적서 / 세부견적서 / 간이영수증" 중 하나를 고르는 선택 화면.
// 기존 간이견적서(EstimateForm) 기능은 전혀 건드리지 않고, 이 화면만 새로 추가되었다.
export default function EstimatePicker({ onSelect, canUseDetailed, canUseReceipt }) {
  return (
    <div style={S.content}>
      <div style={S.sectionTitle}>견적서</div>
      <div style={{ fontSize:12, color:C.text3, marginBottom:16 }}>
        작성할 종류를 선택하세요
      </div>

      <button onClick={() => onSelect("simple")}
        style={{
          display:"block", width:"100%", textAlign:"left", cursor:"pointer",
          background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`,
          borderRadius:14, padding:"18px 16px", marginBottom:12,
        }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:28 }}>📋</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>간이견적서</div>
            <div style={{ fontSize:12, color:C.text3, marginTop:3 }}>
              내용과 총 견적금액만 빠르게 작성 · 지금까지 쓰던 견적서
            </div>
          </div>
          <span style={{ color:C.text3, fontSize:18 }}>→</span>
        </div>
      </button>

      <button onClick={() => canUseDetailed && onSelect("detailed")}
        disabled={!canUseDetailed}
        style={{
          display:"block", width:"100%", textAlign:"left",
          cursor: canUseDetailed ? "pointer" : "not-allowed",
          background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`,
          borderRadius:14, padding:"18px 16px", marginBottom:12, opacity: canUseDetailed ? 1 : 0.5,
        }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:28 }}>{canUseDetailed ? "🧾" : "🔒"}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>세부견적서</div>
            <div style={{ fontSize:12, color:C.text3, marginTop:3 }}>
              {canUseDetailed
                ? "품목별 규격·수량·단가를 표로 작성하는 표준 공사 견적서 (최대 10개 품목)"
                : "관리자가 사용 권한을 허용해야 이용할 수 있습니다"}
            </div>
          </div>
          {canUseDetailed && <span style={{ color:C.text3, fontSize:18 }}>→</span>}
        </div>
      </button>

      <button onClick={() => canUseReceipt && onSelect("receipt")}
        disabled={!canUseReceipt}
        style={{
          display:"block", width:"100%", textAlign:"left",
          cursor: canUseReceipt ? "pointer" : "not-allowed",
          background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`,
          borderRadius:14, padding:"18px 16px", opacity: canUseReceipt ? 1 : 0.5,
        }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:28 }}>{canUseReceipt ? "🧾" : "🔒"}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>간이영수증</div>
            <div style={{ fontSize:12, color:C.text3, marginTop:3 }}>
              {canUseReceipt
                ? "금액을 한글로 자동 표기하는 표준 영수증 양식"
                : "관리자가 사용 권한을 허용해야 이용할 수 있습니다"}
            </div>
          </div>
          {canUseReceipt && <span style={{ color:C.text3, fontSize:18 }}>→</span>}
        </div>
      </button>

      <div style={{ fontSize:11, color:C.text4, marginTop:16, lineHeight:1.6 }}>
        ℹ️ 세부견적서와 간이영수증은 공유·팀·개인 구분 없이 모든 사용자가 함께 보고 작성·수정할 수 있습니다.
      </div>
    </div>
  );
}
