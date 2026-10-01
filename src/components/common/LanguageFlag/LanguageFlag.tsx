import type { CSSProperties } from "react";

// SVG, no emoji: las banderas deben verse también en Windows.
const style: CSSProperties = { width: 28, height: 19, display: "block", flexShrink: 0, borderRadius: 3 };

const LanguageFlag = ({ code }: { code: string }) => (
  <svg viewBox="0 0 30 20" style={style} aria-hidden="true" focusable="false">
    {code === "es" ? <>
      <path fill="#aa151b" d="M0 0h30v20H0z" />
      <path fill="#f1bf00" d="M0 5h30v10H0z" />
      <path fill="#aa151b" d="M7 8h4v5H7z" />
      <path fill="#f1bf00" d="M7 8h4v1H7zM8 10h2v2H8z" />
    </> : code === "pt" ? <>
      <path fill="#009739" d="M0 0h30v20H0z" />
      <path fill="#ffdf00" d="m15 2 13 8-13 8L2 10z" />
      <circle fill="#002776" cx="15" cy="10" r="5" />
      <path stroke="#fff" strokeWidth="1.1" fill="none" d="M10.2 8.6q5-.7 9.3 3.5" />
      <circle fill="#fff" cx="14" cy="12" r=".4" />
      <circle fill="#fff" cx="16" cy="13" r=".4" />
    </> : <>
      <path fill="#fff" d="M0 0h30v20H0z" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} fill="#b22234" d={`M0 ${i * 40 / 13}h30v${20 / 13}H0z`} />)}
      <path fill="#3c3b6e" d="M0 0h13v10.77H0z" />
      {Array.from({ length: 5 }, (_, y) => Array.from({ length: 6 }, (_, x) => <circle key={`${x}-${y}`} fill="#fff" cx={1.2 + x * 2.1} cy={1.1 + y * 2.1} r=".45" />))}
    </>}
  </svg>
);

export default LanguageFlag;
