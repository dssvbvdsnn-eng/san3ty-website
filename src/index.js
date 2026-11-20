import { onRequest } from "../functions/api/chat.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route the chatbot endpoint through the server-side matching function.
    if (url.pathname === "/api/chat" || url.pathname.startsWith("/api/chat/")) {
      return onRequest({
        request,
        env,
        waitUntil: promise => ctx.waitUntil(promise)
      });
    }

    // Serve the website from Cloudflare Workers Static Assets.
    return env.ASSETS.fetch(request);
  }
};
