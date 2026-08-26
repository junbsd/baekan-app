import { useState, useRef } from "react";
import { S, C, fmt } from "../styles/theme";

const MAX_MB = 50;
const MAX_FILES = 20;       // 작업 1건당 최대 업로드 개수
const UPLOAD_CONCURRENCY = 3; // 한 번에 동시에 업로드할 파일 수 (안정성을 위해 제한)
const COMPRESS_MAX_PX = 1920;  // 최대 해상도
const COMPRESS_QUALITY = 0.75;  // JPG 품질 (75%)

// ── 우분투 서버(media-server) 설정 ─────────────────────────────
// 주의: 이 API_KEY는 브라우저 코드에 포함되어 외부에 노출됩니다.
// media-server의 CORS는 이 앱의 도메인으로만 제한되어 있어 다른 웹사이트에서
// 도용하기는 어렵지만, 완전한 비밀은 아님을 감안해주세요.
const MEDIA_SERVER_URL = "https://media.apexpro.kr";
const MEDIA_API_KEY = "12po3i4u32kjwer94"; // media-server의 docker-compose.yml과 동일한 값

// ── 사진 압축 함수 ───────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve) => {
    // 영상이면 압축 없이 그대로
    if (file.type.startsWith("video/")) { resolve(file); return; }
    // 이미지 압축
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // 최대 해상도 초과 시 축소
      if (width > COMPRESS_MAX_PX || height > COMPRESS_MAX_PX) {
        const ratio = Math.min(COMPRESS_MAX_PX/width, COMPRESS_MAX_PX/height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type:"image/jpeg" });
        resolve(compressed);
      }, "image/jpeg", COMPRESS_QUALITY);
    };
    img.onerror = () => resolve(file); // 실패 시 원본
    img.src = url;
  });
}

export default function MediaUploader({ workId, existingFiles=[], onFilesChange, readOnly=false }) {
  const [files, setFiles] = useState(existingFiles);
  const [uploading, setUploading] = useState(false);
  const [progresses, setProgresses] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const inputRef = useRef();

  // XMLHttpRequest를 사용해 진행률(progress)까지 표시하며 media-server에 업로드합니다.
  const uploadFile = (file) => new Promise((resolve, reject) => {
    if (file.size > MAX_MB * 1024 * 1024) { alert(`${file.name}: 최대 ${MAX_MB}MB`); return reject(); }
    const isVideo = file.type.startsWith("video/");

    const form = new FormData();
    form.append("file", file, file.name);
    form.append("workId", workId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${MEDIA_SERVER_URL}/upload`);
    xhr.setRequestHeader("X-API-Key", MEDIA_API_KEY);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgresses(p => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new Error(`업로드 실패 (${xhr.status})`));
      }
      try {
        const data = JSON.parse(xhr.responseText);
        resolve({ url: data.url, path: data.path, name: file.name, size: file.size, type: isVideo ? "video" : "image" });
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    xhr.send(form);
  });

  const [overallProgress, setOverallProgress] = useState(null); // {done, total}

  // 동시에 너무 많은 파일을 한꺼번에 올리지 않도록 개수를 제한해서 순차 처리합니다.
  // (한꺼번에 20장을 다 쏘면 휴대폰/서버 부담으로 일부가 실패하기 쉬워서, 3개씩 묶어 처리합니다)
  const uploadWithConcurrency = async (fileList) => {
    const results = new Array(fileList.length).fill(null);
    let nextIndex = 0;
    let doneCount = 0;

    const worker = async () => {
      while (nextIndex < fileList.length) {
        const current = nextIndex++;
        try {
          results[current] = await uploadFile(fileList[current]);
        } catch (e) {
          results[current] = null;
        }
        doneCount++;
        setOverallProgress({ done: doneCount, total: fileList.length });
      }
    };

    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, fileList.length) }, worker);
    await Promise.all(workers);
    return results;
  };

  const handleFiles = async (selected) => {
    if (!selected.length) return;

    // 20장 제한 검사 (기존에 이미 올라간 파일 수 + 새로 추가하려는 파일 수)
    const remainingSlots = MAX_FILES - files.length;
    if (remainingSlots <= 0) {
      alert(`작업 1건당 사진·영상은 최대 ${MAX_FILES}개까지만 올릴 수 있습니다.`);
      return;
    }
    let selectedArray = Array.from(selected);
    if (selectedArray.length > remainingSlots) {
      alert(`최대 ${MAX_FILES}개까지만 가능해서, 앞의 ${remainingSlots}개만 업로드합니다.`);
      selectedArray = selectedArray.slice(0, remainingSlots);
    }

    setUploading(true);
    setOverallProgress({ done: 0, total: selectedArray.length });
    try {
      // 이미지 압축 후, 3개씩 순차적으로 업로드 (안정성 확보)
      const compressed = await Promise.all(selectedArray.map(f => compressImage(f)));
      const results = await uploadWithConcurrency(compressed);
      const newFiles = [...files, ...results.filter(Boolean)];
      setFiles(newFiles); onFilesChange?.(newFiles);
      const failedCount = results.filter(r => !r).length;
      if (failedCount > 0) alert(`${failedCount}개 파일 업로드에 실패했습니다. 다시 시도해주세요.`);
    } catch(e) {}
    setProgresses({}); setOverallProgress(null); setUploading(false);
  };

  const handleDelete = async (file, idx) => {
    if (!window.confirm(`"${file.name}" 삭제할까요?`)) return;
    try {
      await fetch(`${MEDIA_SERVER_URL}/file`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-API-Key": MEDIA_API_KEY },
        body: JSON.stringify({ path: file.path }),
      });
    } catch(e) {}
    const newFiles = files.filter((_,i)=>i!==idx);
    setFiles(newFiles); onFilesChange?.(newFiles);
  };


  const images = files.filter(f=>f.type==="image");
  const videos = files.filter(f=>f.type==="video");

  return (
    <div>
      {!readOnly && (
        <>
          <div
            style={{ border:`2px dashed ${dragOver?C.blue:"rgba(255,255,255,0.12)"}`,
              background: dragOver?`${C.blue}08`:"transparent",
              borderRadius:12, padding:18, textAlign:"center",
              cursor: (uploading || files.length>=MAX_FILES) ? "default" : "pointer",
              opacity: files.length>=MAX_FILES ? 0.5 : 1,
              transition:"all 0.2s" }}
            onClick={() => !uploading && files.length<MAX_FILES && inputRef.current?.click()}
            onDragOver={e=>{e.preventDefault(); if(files.length<MAX_FILES) setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false); if(files.length<MAX_FILES) handleFiles(e.dataTransfer.files);}}>
            <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}}
              disabled={files.length>=MAX_FILES}
              onChange={e=>handleFiles(e.target.files)} />
            <div style={{fontSize:28,marginBottom:4}}>{uploading?"⏳":files.length>=MAX_FILES?"🚫":"📸"}</div>
            <div style={{fontSize:13,color:C.text3}}>
              {uploading?"압축·업로드 중...":files.length>=MAX_FILES?"최대 개수에 도달했습니다":"사진·영상 추가"}
            </div>
            <div style={{fontSize:11,color:C.text4,marginTop:2}}>
              자동 압축 적용 · 최대 {MAX_MB}MB · 최대 {MAX_FILES}장 ({files.length}/{MAX_FILES})
            </div>
          </div>
          {overallProgress && (
            <div style={{marginTop:8, marginBottom:2}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.text,marginBottom:3,fontWeight:700}}>
                <span>전체 업로드 진행</span><span>{overallProgress.done}/{overallProgress.total}</span>
              </div>
              <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden"}}>
                <div style={S.progressFill(Math.round((overallProgress.done/overallProgress.total)*100))} />
              </div>
            </div>
          )}
          {Object.entries(progresses).map(([name,pct])=>(
            <div key={name} style={{marginTop:6}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.text3,marginBottom:2}}>
                <span>{name.slice(0,30)}</span><span>{pct}%</span>
              </div>
              <div style={{height:5,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden"}}>
                <div style={S.progressFill(pct)} />
              </div>
            </div>
          ))}
        </>
      )}
      {images.length > 0 && (
        <div style={{marginTop:10}}>
          <div style={{fontSize:11,color:C.text3,marginBottom:6}}>📷 사진 {images.length}장</div>
          <div style={S.mediaGrid}>
            {images.map((f,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={f.url} alt={f.name} style={S.mediaThumb} onClick={()=>setLightbox(f.url)} />
                {!readOnly && <button onClick={()=>handleDelete(f,files.indexOf(f))}
                  style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.7)",border:"none",
                    borderRadius:"50%",width:20,height:20,color:"#fff",fontSize:10,cursor:"pointer"}}>✕</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div style={{marginTop:10}}>
          <div style={{fontSize:11,color:C.text3,marginBottom:6}}>🎥 영상 {videos.length}개</div>
          {videos.map((f,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"8px 10px",marginBottom:4}}>
              <div>
                <div style={{fontSize:12,color:C.text}}>{f.name.slice(0,28)}</div>
                <div style={{fontSize:10,color:C.text3}}>{fmt.fileSize(f.size)}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <a href={f.url} target="_blank" rel="noreferrer"
                  style={{fontSize:11,color:C.blue,textDecoration:"none"}}>재생</a>
                {!readOnly && <button onClick={()=>handleDelete(f,files.indexOf(f))}
                  style={{background:"none",border:"none",color:C.red,fontSize:12,cursor:"pointer"}}>✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:500,
          display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setLightbox(null)}>
          <img src={lightbox} alt="" style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:8}} />
          <button onClick={()=>setLightbox(null)} style={{position:"fixed",top:20,right:20,
            background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",
            width:36,height:36,color:"#fff",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
      )}
    </div>
  );
}
