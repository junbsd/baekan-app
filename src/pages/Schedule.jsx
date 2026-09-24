import { useState, useEffect } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const STATUS_LABEL = { "예정": "예정", "완료": "완료", "취소": "취소" };
const STATUS_COLOR = { "예정": C.blue, "완료": C.green, "취소": C.text3 };

// ── 담당자 다중 선택 ──────────────────────────────────────────
function AssigneePicker({ candidates, selectedUids, onChange }) {
  const toggle = (u) => {
    if (selectedUids.includes(u.id)) onChange(selectedUids.filter(id => id !== u.id));
    else onChange([...selectedUids, u.id]);
  };
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
      {candidates.length === 0 && (
        <div style={{ fontSize:12, color:C.text4 }}>일정 사용 권한이 있는 담당자가 없습니다.</div>
      )}
      {candidates.map(u => (
        <button key={u.id} type="button" onClick={()=>toggle(u)}
          style={{
            padding:"7px 14px", borderRadius:20, fontSize:13, cursor:"pointer",
            border:`1px solid ${selectedUids.includes(u.id) ? C.blue : C.border2}`,
            background: selectedUids.includes(u.id) ? `${C.blue}25` : "rgba(255,255,255,0.04)",
            color: selectedUids.includes(u.id) ? "#fff" : C.text2, fontWeight: selectedUids.includes(u.id) ? 700 : 400,
          }}>
          {selectedUids.includes(u.id) ? "✓ " : ""}{u.name}{u.companyName ? ` (${u.companyName})` : ""}
        </button>
      ))}
    </div>
  );
}

// ── 일정 작성/수정 모달 ───────────────────────────────────────
function ScheduleFormModal({ initial, candidates, profile, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [date, setDate] = useState(initial?.date || fmt.today());
  const [time, setTime] = useState(initial?.time || "");
  const [clientCompany, setClientCompany] = useState(initial?.clientCompany || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [content, setContent] = useState(initial?.content || "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [assigneeUids, setAssigneeUids] = useState(initial?.assigneeUids || (profile?.uid ? [profile.uid] : []));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!date) { alert("날짜를 입력해주세요."); return; }
    setSaving(true);
    try {
      const assigneeNames = candidates.filter(c => assigneeUids.includes(c.id)).map(c => c.name);
      const data = {
        date, time, clientCompany, location, content, memo,
        assigneeUids, assigneeNames,
        updatedAt: new Date().toISOString(),
      };
      if (isEdit) {
        await updateDoc(doc(db, "schedules", initial.id), data);
      } else {
        data.status = "예정";
        data.workId = null;
        data.createdByUid = profile.uid;
        data.createdByName = profile.name;
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, "schedules"), data);
      }
      onSaved();
    } catch (e) { alert("저장 중 오류: " + e.message); }
    setSaving(false);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{isEdit ? "일정 수정" : "새 일정"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div style={S.fg}>
            <label style={S.label}>날짜 *</label>
            <input type="date" style={S.input} value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div style={S.fg}>
            <label style={S.label}>시간</label>
            <input type="time" style={S.input} value={time} onChange={e=>setTime(e.target.value)} />
          </div>
        </div>

        <div style={S.fg}>
          <label style={S.label}>발주업체</label>
          <input style={S.input} placeholder="예: OO건설 (나중에 입력해도 됩니다)"
            value={clientCompany} onChange={e=>setClientCompany(e.target.value)} />
        </div>

        <div style={S.fg}>
          <label style={S.label}>시공 장소</label>
          <input style={S.input} placeholder="예: 서울시 강남구 역삼동 123"
            value={location} onChange={e=>setLocation(e.target.value)} />
        </div>

        <div style={S.fg}>
          <label style={S.label}>예정 내용</label>
          <textarea style={S.textarea} placeholder="아직 정해지지 않았으면 비워두고 나중에 채워도 됩니다"
            value={content} onChange={e=>setContent(e.target.value)} />
        </div>

        <div style={S.fg}>
          <label style={S.label}>👷 담당자 (여러 명 선택 가능)</label>
          <AssigneePicker candidates={candidates} selectedUids={assigneeUids} onChange={setAssigneeUids} />
        </div>

        <div style={S.fg}>
          <label style={S.label}>메모</label>
          <textarea style={{ ...S.textarea, minHeight:60 }} placeholder="참고사항"
            value={memo} onChange={e=>setMemo(e.target.value)} />
        </div>

        <button style={{ ...S.btnPrimary, opacity:saving?0.6:1 }} onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "💾 일정 저장"}
        </button>
      </div>
    </div>
  );
}

// ── 일정 상세 모달 ────────────────────────────────────────────
function ScheduleDetailModal({ schedule, candidates, works, profile, onClose, onEdit, onStartWork, onViewWork }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const linkedWork = schedule.workId ? works.find(w => w.id === schedule.workId) : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "schedules", schedule.id));
      onClose();
    } catch (e) { alert("삭제 오류: " + e.message); setDeleting(false); }
  };

  const handleCancel = async () => {
    setChangingStatus(true);
    try {
      await updateDoc(doc(db, "schedules", schedule.id), { status:"취소", updatedAt:new Date().toISOString() });
      onClose();
    } catch (e) { alert("변경 오류: " + e.message); }
    setChangingStatus(false);
  };

  const handleReopen = async () => {
    setChangingStatus(true);
    try {
      await updateDoc(doc(db, "schedules", schedule.id), { status:"예정", updatedAt:new Date().toISOString() });
      onClose();
    } catch (e) { alert("변경 오류: " + e.message); }
    setChangingStatus(false);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, paddingBottom:40 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>일정 상세</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
            <div>
              <div style={{ fontSize:12, color:C.text3, marginBottom:2 }}>
                {fmt.date(schedule.date)}{schedule.time ? ` · ${schedule.time}` : ""}
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{schedule.clientCompany || "(발주업체 미정)"}</div>
            </div>
            <span style={S.badge(STATUS_COLOR[schedule.status])}>{STATUS_LABEL[schedule.status]}</span>
          </div>
          {schedule.location && (
            <div style={{ fontSize:13, color:C.text2, marginBottom:4 }}>📍 {schedule.location}</div>
          )}
          {schedule.content && (
            <div style={{ fontSize:13, color:C.text, lineHeight:1.6, marginTop:6 }}>{schedule.content}</div>
          )}
          {!schedule.content && (
            <div style={{ fontSize:12, color:C.text4, marginTop:6 }}>예정 내용이 아직 입력되지 않았습니다.</div>
          )}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>👷 담당자</div>
          {(schedule.assigneeNames || []).length === 0 ? (
            <div style={{ fontSize:12, color:C.text4 }}>지정된 담당자가 없습니다.</div>
          ) : (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {schedule.assigneeNames.map((n,i) => (
                <span key={i} style={{ fontSize:12, padding:"4px 10px", background:"rgba(59,130,246,0.15)",
                  border:`1px solid ${C.blue}40`, borderRadius:8, color:"#93c5fd" }}>{n}</span>
              ))}
            </div>
          )}
        </div>

        {schedule.memo && (
          <div style={{ ...S.card, border:`1px solid ${C.yellow}30` }}>
            <div style={{ fontSize:11, color:C.yellow, fontWeight:700, marginBottom:4 }}>📌 메모</div>
            <div style={{ fontSize:13, color:C.text }}>{schedule.memo}</div>
          </div>
        )}

        {/* 완료 상태 - 작업일지 연결 */}
        {schedule.status === "완료" && (
          <div style={{ ...S.card, border:`1px solid ${C.green}30` }}>
            <div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:6 }}>
              ✅ 작업일지 작성 완료 {schedule.completedByName ? `· ${schedule.completedByName}님` : ""}
            </div>
            {linkedWork ? (
              <button style={{ ...S.btnSmall(C.green), width:"100%" }} onClick={()=>onViewWork(schedule.workId)}>
                📄 작업일지 보기
              </button>
            ) : (
              <div style={{ fontSize:11.5, color:C.text4 }}>
                {schedule.workId ? "이 작업일지를 볼 수 있는 권한이 없습니다." : "연결된 작업일지 정보를 확인할 수 없습니다."}
              </div>
            )}
          </div>
        )}

        {/* 예정 상태 - 작업일지 작성 진입 */}
        {schedule.status === "예정" && (
          <button style={{ ...S.btnPrimary, marginBottom:10 }} onClick={()=>onStartWork(schedule)}>
            🔧 이 일정으로 작업일지 작성
          </button>
        )}

        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <button style={{ ...S.btnSmall(C.blue), flex:1 }} onClick={()=>{ onEdit(schedule); onClose(); }}>✏️ 수정</button>
          {schedule.status === "예정" && (
            <button style={{ ...S.btnSmall(C.text3), flex:1 }} onClick={handleCancel} disabled={changingStatus}>🚫 취소 처리</button>
          )}
          {schedule.status === "취소" && (
            <button style={{ ...S.btnSmall(C.blue), flex:1 }} onClick={handleReopen} disabled={changingStatus}>↩️ 예정으로</button>
          )}
        </div>

        <div style={S.divider} />
        {!confirmDelete ? (
          <button style={S.btnDanger} onClick={()=>setConfirmDelete(true)}>🗑 일정 삭제</button>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...S.btnSecondary, flex:1 }} onClick={()=>setConfirmDelete(false)}>취소</button>
            <button disabled={deleting} onClick={handleDelete}
              style={{ flex:1, padding:"11px", background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.4)",
                borderRadius:12, color:C.red, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {deleting ? "삭제 중..." : "삭제 확인"}
            </button>
          </div>
        )}
        {schedule.workId && (
          <div style={{ fontSize:10.5, color:C.text4, marginTop:8 }}>
            ※ 일정을 삭제해도 이미 작성된 작업일지는 지워지지 않습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ── 일정 화면 메인 ────────────────────────────────────────────
export default function Schedule({ works, profile, onStartWork, onTabChange }) {
  const [schedules, setSchedules] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [statusFilter, setStatusFilter] = useState("예정"); // 예정 | 완료 | 취소 | 전체
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selected, setSelected] = useState(null);

  // 일정 목록 실시간 - 일정 사용 승인된 사람들은 전체를 공유해서 본다.
  useEffect(() => {
    const q = query(collection(db, "schedules"));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => {
        const ka = `${a.date}T${a.time||"00:00"}`, kb = `${b.date}T${b.time||"00:00"}`;
        return ka.localeCompare(kb);
      });
      setSchedules(list);
    });
  }, []);

  // 담당자 후보 - workerDirectory 중 일정 사용 권한이 켜진 사람만
  // (where만 사용하고 정렬은 클라이언트에서 처리 - where+orderBy 복합 인덱스를 새로 만들 필요 없게)
  useEffect(() => {
    const q = query(collection(db, "workerDirectory"), where("canUseSchedule", "==", true));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => (a.name||"").localeCompare(b.name||""));
      setCandidates(list);
    });
  }, []);

  const filtered = statusFilter === "전체" ? schedules : schedules.filter(s => s.status === statusFilter);

  const handleViewWork = (workId) => {
    setSelected(null);
    onTabChange("revenue", { workId });
  };

  return (
    <div style={S.content}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={S.sectionTitle}>일정</div>
        <button style={{ ...S.btnSmall(C.blue) }} onClick={()=>{ setEditTarget(null); setShowForm(true); }}>
          ➕ 새 일정
        </button>
      </div>

      {/* 상태 필터 */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {["예정","완료","취소","전체"].map(s => (
          <button key={s} onClick={()=>setStatusFilter(s)}
            style={{
              flex:1, padding:"8px 4px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
              border:`1px solid ${statusFilter===s ? C.blue : C.border}`,
              background: statusFilter===s ? `${C.blue}20` : "rgba(255,255,255,0.03)",
              color: statusFilter===s ? "#fff" : C.text3,
            }}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ color:C.text4, fontSize:13, textAlign:"center", padding:24 }}>
          {statusFilter === "예정" ? "예정된 일정이 없습니다" : "일정이 없습니다"}
        </div>
      )}

      {filtered.map(s => (
        <div key={s.id} style={S.listItem} onClick={()=>setSelected(s)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:C.text3, marginBottom:2 }}>
                {fmt.date(s.date)}{s.time ? ` · ${s.time}` : ""}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{s.clientCompany || "(발주업체 미정)"}</div>
              {s.location && <div style={{ fontSize:11, color:C.text4, marginTop:1 }}>📍 {s.location}</div>}
              {(s.assigneeNames||[]).length > 0 && (
                <div style={{ fontSize:11, color:C.text4, marginTop:3 }}>👷 {s.assigneeNames.join(", ")}</div>
              )}
            </div>
            <span style={S.badge(STATUS_COLOR[s.status])}>{STATUS_LABEL[s.status]}</span>
          </div>
        </div>
      ))}

      {showForm && (
        <ScheduleFormModal
          initial={editTarget}
          candidates={candidates}
          profile={profile}
          onClose={()=>{ setShowForm(false); setEditTarget(null); }}
          onSaved={()=>{ setShowForm(false); setEditTarget(null); }}
        />
      )}

      {selected && (
        <ScheduleDetailModal
          schedule={selected}
          candidates={candidates}
          works={works}
          profile={profile}
          onClose={()=>setSelected(null)}
          onEdit={(s)=>{ setEditTarget(s); setShowForm(true); }}
          onStartWork={(s)=>{ setSelected(null); onStartWork(s); }}
          onViewWork={handleViewWork}
        />
      )}
    </div>
  );
}
