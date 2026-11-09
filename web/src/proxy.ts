import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // 쿠키 인증은 EC2에서 수행한다. 전달 전에 브라우저의 동일 출처 요청인지 검증한다.
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== request.nextUrl.origin
  ) {
    return NextResponse.json(
      { message: "허용되지 않은 요청 출처입니다." },
      { status: 403 },
    );
  }
  const upstream = new URL(process.env.API_ORIGIN || "http://127.0.0.1:3411");
  if (
    upstream.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(upstream.hostname)
  ) {
    return NextResponse.json(
      { message: "API 연결 설정 오류" },
      { status: 503 },
    );
  }
  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    upstream,
  );
  const headers = new Headers(request.headers);
  // 동일 출처 검증을 통과한 서버 간 요청만 기존 EC2 서비스 출처로 전달한다.
  headers.set(
    "origin",
    process.env.API_ORIGIN ? upstream.origin : "http://localhost:3410",
  );
  return NextResponse.rewrite(target, { request: { headers } });
}
export const config = { matcher: "/api/:path*" };
