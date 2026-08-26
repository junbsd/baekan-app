import { useState, useEffect } from "react";

// 창 너비 768px을 기준으로 PC/모바일을 판단합니다.
// (아이패드 등 큰 화면 모바일 기기도 이 기준을 넘으면 PC 레이아웃으로 봅니다 — 화면이 넓으면 넓게 쓰는 게 자연스럽기 때문입니다)
const PC_BREAKPOINT = 768;

export default function useIsPC() {
  const [isPC, setIsPC] = useState(
    typeof window !== "undefined" ? window.innerWidth >= PC_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => setIsPC(window.innerWidth >= PC_BREAKPOINT);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isPC;
}
