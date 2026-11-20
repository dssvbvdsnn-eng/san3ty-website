import { onRequest } from "../functions/api/chat.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const aiBound = Boolean(env.AI && typeof env.AI.run === "function");
      const dbBound = Boolean(env.DB && typeof env.DB.prepare === "function");
      let dbConnected = false;
      let artisanCount = null;
      let demoCount = null;

      if (dbBound) {
        try {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) AS total, SUM(CASE WHEN bio LIKE 'بيانات تجريبية غير حقيقية%' THEN 1 ELSE 0 END) AS demo FROM artisans"
          ).first();
          dbConnected = true;
          artisanCount = Number(row?.total || 0);
          demoCount = Number(row?.demo || 0);
        } catch {
          dbConnected = false;
        }
      }

      return Response.json({
        ok: true,
        aiBound,
        dbBound,
        dbConnected,
        artisanCount,
        demoCount,
        chatEndpoint: "/api/chat"
      }, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/api/chat" || url.pathname.startsWith("/api/chat/")) {
      return onRequest({
        request,
        env,
        waitUntil: promise => ctx.waitUntil(promise)
      });
    }

    return env.ASSETS.fetch(request);
  }
};
