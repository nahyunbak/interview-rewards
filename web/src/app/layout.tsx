import Link from "next/link";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-body",
  display: "swap",
});
export const metadata: Metadata = {
  title: "VOICE / VALUE — 인터뷰 리워드",
  description: "당신의 경험이 제품의 다음을 만듭니다.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <a className="skip" href="#main">
          본문으로 이동
        </a>
        <header>
          <Link className="wordmark" href="/">
            VOICE <span>/</span> VALUE
          </Link>
          <span className="network-tag">TESTNET EXPERIENCE</span>
          <a href="/admin" className="admin-link">
            리서치 관리 ↗
          </a>
        </header>
        {children}
        <footer>
          <span>경험을 듣고, 가치를 돌려드립니다.</span>
          <span>Base Sepolia · Solana Devnet</span>
        </footer>
      </body>
    </html>
  );
}
