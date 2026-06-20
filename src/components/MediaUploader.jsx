import { useState, useRef } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { S, C, fmt } from "../styles/theme";

const MAX_MB = 50;
const COMPRESS_MAX_PX = 1920;  // 최대 해상도
const COMPRESS_QUALITY = 0.75;  // JPG 품질 (75%)

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

  const uploadFile = (file) => new Promise((resolve, reject) => {
    if (file.size > MAX_MB * 1024 * 1024) { alert(`${file.name}: 최대 ${MAX_MB}MB`); return reject(); }
    const isVideo = file.type.startsWith("video/");
    const ext = isVideo ? file.name.split(".").pop() : "jpg";
    const path = `works/${workId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on("state_changed",
      snap => setProgresses(p => ({ ...p, [file.name]: Math.round(snap.bytesTransferred/snap.totalBytes*100) })),
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path, name:file.name, size:file.size, type: isVideo?"video":"image" });
      }
    );
  });

  const handleFiles = async (selected) => {
    if (!selected.length) return;
    setUploading(true);
    try {
      // 이미지 압축 후 업로드
      const compressed = await Promise.all(Array.from(selected).map(f => compressImage(f)));
      const results = await Promise.all(compressed.map(f => uploadFile(f).catch(()=>null)));
      const newFiles = [...files, ...results.filter(Boolean)];
      setFiles(newFiles); onFilesChange?.(newFiles);
    } catch(e) {}
    setProgresses({}); setUploading(false);
  };

  const handleDelete = async (file, idx) => {
    if (!window.confirm(`"${file.name}" 삭제할까요?`)) return;
    try { await deleteObject(ref(storage, file.path)); } catch(e) {}
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
              borderRadius:12, padding:18, textAlign:"center", cursor:"pointer", transition:"all 0.2s" }}
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}}>
            <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}}
              onChange={e=>handleFiles(e.target.files)} />
            <div style={{fontSize:28,marginBottom:4}}>{uploading?"⏳":"📸"}</div>
            <div style={{fontSize:13,color:C.text3}}>{uploading?"압축·업로드 중...":"사진·영상 추가"}</div>
            <div style={{fontSize:11,color:C.text4,marginTop:2}}>
              자동 압축 적용 · 최대 {MAX_MB}MB · 여러 장 동시 가능
            </div>
          </div>
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
