import { useState, useRef } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { storage, db } from "../firebase";
import { S, C } from "../styles/theme";

const MAX_PX = 400; // 서명/도장은 작은 이미지면 충분

// 투명 배경 유지하며 PNG로 리사이즈
function resizeToPng(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        const ratio = Math.min(MAX_PX / width, MAX_PX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, width, height); // 투명 배경 유지
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("이미지 변환 실패")); return; }
        resolve(new File([blob], "signature.png", { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
    img.src = url;
  });
}

export default function SignatureUploader({ user, profile, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();
  const signatureUrl = profile?.signatureUrl || "";

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드 가능합니다."); return; }
    setError(""); setUploading(true);
    try {
      const resized = await resizeToPng(file);
      const path = `signatures/${user.uid}.png`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, resized);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "users", user.uid), {
        signatureUrl: url,
        updatedAt: new Date().toISOString(),
      });
      // 세부견적서의 "다른 사용자 선택" 기능에서 서명도 함께 보이도록 공개용 컬렉션에도 동기화
      await setDoc(doc(db, "workerDirectory", user.uid), { signatureUrl: url }, { merge: true });
      onUpdate?.({ signatureUrl: url });
    } catch (e) {
      setError("업로드 중 오류가 발생했습니다: " + e.message);
    }
    setUploading(false);
  };

  const handleRemove = async () => {
    if (!window.confirm("서명/도장 이미지를 삭제할까요?")) return;
    setUploading(true);
    try {
      try { await deleteObject(ref(storage, `signatures/${user.uid}.png`)); } catch (e) {}
      await updateDoc(doc(db, "users", user.uid), {
        signatureUrl: "",
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "workerDirectory", user.uid), { signatureUrl: "" }, { merge: true });
      onUpdate?.({ signatureUrl: "" });
    } catch (e) {
      setError("삭제 중 오류가 발생했습니다: " + e.message);
    }
    setUploading(false);
  };

  return (
    <div style={S.fg}>
      <label style={S.label}>✍️ 서명 · 도장</label>
      <div style={{ fontSize: 11, color: C.text4, marginBottom: 8 }}>
        작업보고서 · 소견서에 작성자 이름 옆에 표시됩니다. 투명 배경 PNG 권장.
      </div>

      {signatureUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ width: 64, height: 64, borderRadius: 8, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            border: `1px solid ${C.border2}` }}>
            <img src={signatureUrl} alt="서명" style={{ maxWidth: "85%", maxHeight: "85%", objectFit: "contain" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ 등록됨</div>
            <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>새 이미지 업로드 시 자동 교체</div>
          </div>
          <button onClick={handleRemove} disabled={uploading}
            style={{ ...S.btnDanger, padding: "6px 12px", fontSize: 12 }}>삭제</button>
        </div>
      )}

      {error && <div style={{ ...S.toast(false), padding: "8px 12px", fontSize: 12 }}>{error}</div>}

      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => handleFile(e.target.files)} />
      <button
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        style={{ ...S.btnSecondary, opacity: uploading ? 0.6 : 1 }}>
        {uploading ? "⏳ 업로드 중..." : signatureUrl ? "🖼 다른 이미지로 변경" : "🖼 서명 · 도장 이미지 업로드"}
      </button>
    </div>
  );
}
