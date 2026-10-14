// Vercel Edge Middleware による Basic 認証（プレビュー用）．
// 環境変数 BASIC_AUTH_USER / BASIC_AUTH_PASS が未設定のときは 503 を返す（認証なしで公開しない）．
export const config = { matcher: "/(.*)" };

export default function middleware(req: Request): Response | undefined {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) {
    return new Response("Basic auth is not configured", { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(auth.slice(6)).split(":");
      if (u === user && rest.join(":") === pass) return undefined;
    } catch {
      // 不正なヘッダは未認証扱い
    }
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dx-timetable preview"' },
  });
}
