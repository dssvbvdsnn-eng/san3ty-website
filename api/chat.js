const MAX_HISTORY = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 8000;
const MAX_IMAGE_LENGTH = 3_000_000;

const SYSTEM_INSTRUCTIONS = [
  "أنت مساعد SAN3TY الذكي لخدمات الصيانة المنزلية في مصر.",
  "تحدث دائمًا بالعربية المصرية الواضحة والمهذبة، بإجابات مختصرة وعملية.",
  "افهم وصف العطل أولًا، ثم اسأل سؤال توضيح واحدًا فقط عند الحاجة.",
  "صنّف الطلب عند الإمكان إلى سباكة أو كهرباء أو تكييف أو صيانة منزلية أخرى.",
  "اشرح الاحتمالات بحذر، ولا تدّعِ أنك أجريت فحصًا ميدانيًا أو تشخيصًا مؤكدًا.",
  "لا تخترع أسماء فنيين أو تقييمات أو أسعارًا أو مواعيد أو توافر خدمات. وضّح أن الترشيح والحجز الفعليين يحتاجان قاعدة بيانات وربطًا تشغيليًا.",
  "قدّم نصائح سلامة عامة فقط. في حالة شرر أو رائحة احتراق أو أسلاك مكشوفة، انصح بإبعاد الأشخاص وفصل القاطع الرئيسي فقط إذا كان ذلك آمنًا، وعدم لمس الأسلاك أو محاولة الإصلاح، والاستعانة بفني مؤهل. في حالة تسرب مياه شديد، انصح بإغلاق محبس المياه الرئيسي إذا أمكن بأمان.",
  "لا تطلب بيانات حساسة أو كلمات مرور أو معلومات دفع. لا تطلب عنوان المنزل بالتفصيل داخل المحادثة.",
  "إذا كان السؤال خارج نطاق صيانة المنزل، وضّح بلطف أن تخصصك هو مساعدة المستخدم في خدمات المنزل."
].join("\n");

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return send(res, 503, { error: "AI service is not configured", code: "missing_api_key" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { error: "Invalid request body", code: "invalid_body" });
  }

  const incoming = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  if (!incoming.length) {
    return send(res, 400, { error: "At least one message is required", code: "missing_messages" });
  }

  let totalLength = 0;
  const safeMessages = [];
  for (const item of incoming) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") continue;
    const content = item.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content) continue;
    totalLength += content.length;
    safeMessages.push({ role: item.role, content });
  }
  if (!safeMessages.length || totalLength > MAX_TOTAL_LENGTH) {
    return send(res, 400, { error: "Message content is invalid or too long", code: "message_too_long" });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const validImage = image.length <= MAX_IMAGE_LENGTH &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image);

  const input = safeMessages.map((message, index) => {
    const isLast = index === safeMessages.length - 1;
    if (isLast && message.role === "user" && validImage) {
      return {
        role: "user",
        content: [
          { type: "input_text", text: message.content },
          { type: "input_image", image_url: image, detail: "low" }
        ]
      };
    }
    return message;
  });

  const model = process.env.OPENAI_MODEL || "gpt-6-luna";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_INSTRUCTIONS,
        input,
        max_output_tokens: 450,
        store: false
      }),
      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (upstream.status === 401) {
        return send(res, 502, { error: "OpenAI API key is invalid", code: "invalid_api_key" });
      }
      if (upstream.status === 429) {
        return send(res, 429, { error: "OpenAI API rate or usage limit reached", code: "rate_limited" });
      }
      console.error("OpenAI Responses API error", upstream.status, data.error?.code || data.error?.type || "unknown");
      return send(res, 502, { error: "AI provider request failed", code: "provider_error" });
    }

    const reply = typeof data.output_text === "string"
      ? data.output_text.trim()
      : (data.output || [])
          .flatMap(item => item.content || [])
          .filter(part => part.type === "output_text" && typeof part.text === "string")
          .map(part => part.text)
          .join("\n")
          .trim();

    if (!reply) return send(res, 502, { error: "The AI returned an empty response", code: "empty_response" });
    return send(res, 200, { reply, model });
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    console.error("SAN3TY AI request failed", aborted ? "timeout" : error?.message || "unknown error");
    return send(res, aborted ? 504 : 502, {
      error: aborted ? "AI request timed out" : "Could not reach AI provider",
      code: aborted ? "timeout" : "connection_error"
    });
  } finally {
    clearTimeout(timeout);
  }
};
