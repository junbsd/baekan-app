import { useState, useRef } from "react";
import { S, C } from "../styles/theme";

// 자주 쓰는 항목을 상단 태그로, 직접 입력도 가능한 컴포넌트
export default function TagInput({ label, items=[], selected=[], onToggle, onAdd, multi=true, placeholder="입력 후 Enter" }) {
  const [inputVal, setInputVal] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef();

  const filtered = inputVal.trim()
    ? items.filter(i => i.toLowerCase().includes(inputVal.toLowerCase()) && !selected.includes(i))
    : [];

  const handleAdd = (val) => {
    const v = val.trim();
    if (!v) return;
    onAdd && onAdd(v);
    if (!selected.includes(v)) onToggle(v);
    setInputVal("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(inputVal); }
    if (e.key === "Backspace" && !inputVal && selected.length > 0) {
      onToggle(selected[selected.length - 1]);
    }
  };

  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      {/* 자주 쓰는 항목 (상위 8개) */}
      {items.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {items.slice(0,8).map(item => (
            <button key={item} onClick={() => onToggle(item)} style={S.tagBtn(selected.includes(item))}>
              {selected.includes(item) ? "✓ " : ""}{item}
            </button>
          ))}
        </div>
      )}
      {/* 선택된 항목 표시 */}
      {selected.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {selected.map(s => (
            <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"4px 10px",
              background:`${C.blue}25`, border:`1px solid ${C.blue}50`, borderRadius:20,
              fontSize:12, color:C.blue, fontWeight:600 }}>
              {s}
              <button onClick={()=>onToggle(s)} style={{ background:"none", border:"none", color:C.blue,
                cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {/* 직접 입력 */}
      <div style={{ position:"relative" }}>
        <input
          ref={inputRef}
          style={{ ...S.input, ...(focused?{borderColor:C.blue}:{}) }}
          placeholder={placeholder}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(()=>setFocused(false), 150)}
        />
        {inputVal && (
          <button onClick={() => handleAdd(inputVal)}
            style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
              background:C.blue, border:"none", borderRadius:6, color:"#fff",
              fontSize:11, padding:"3px 8px", cursor:"pointer", fontWeight:700 }}>추가</button>
        )}
        {/* 자동완성 드롭다운 */}
        {focused && filtered.length > 0 && (
          <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:50,
            background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10,
            boxShadow:"0 8px 24px rgba(0,0,0,0.4)", marginTop:4, overflow:"hidden" }}>
            {filtered.slice(0,6).map(item => (
              <div key={item} onClick={() => { onToggle(item); setInputVal(""); }}
                style={{ padding:"10px 14px", fontSize:13, color:C.text, cursor:"pointer",
                  borderBottom:`1px solid ${C.border}` }}
                onMouseOver={e => e.target.style.background = "rgba(255,255,255,0.05)"}
                onMouseOut={e => e.target.style.background = "transparent"}>
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize:11, color:C.text4, marginTop:4 }}>
        {multi ? "여러 개 선택 가능 · 새 항목 입력 후 Enter로 추가" : "입력 후 Enter로 추가"}
      </div>
    </div>
  );
}
