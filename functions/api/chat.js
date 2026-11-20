const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_HISTORY = 10;
const MAX_MESSAGE_LENGTH = 1600;
const MAX_TOTAL_LENGTH = 7000;

const TRADE_LABELS = {
  plumbing: "سباكة",
  electrical: "كهرباء",
  air_conditioning: "تكييف",
  carpentry: "نجارة",
  painting: "نقاشة ودهانات",
  appliance_repair: "صيانة أجهزة منزلية",
  water_heater: "سخانات",
  general_maintenance: "صيانة منزلية"
};
const ALLOWED_TRADES = new Set(Object.keys(TRADE_LABELS));

const SYSTEM_PROMPT = `
أنت SAN3TY، مساعد مصري لخدمات الصيانة المنزلية. تحدث بالعربية المصرية المهذبة والواضحة.
مهمتك فهم المشكلة وتحديد التخصص والمنطقة، وليس اختراع الفنيين أو الأسعار أو المواعيد.

حلّل المحادثة كلها، وأخرج كائن JSON فقط دون Markdown أو نص خارجه، بهذه المفاتيح:
{
  "reply": "رد طبيعي قصير باللهجة المصرية",
  "trade": "plumbing أو electrical أو air_conditioning أو carpentry أو painting أو appliance_repair أو water_heater أو general_maintenance أو null",
  "area": "اسم المنطقة/الحي والمحافظة كما ذكرهما المستخدم أو نص فارغ",
  "issue_summary": "ملخص قصير للمشكلة"
}

قواعد التصنيف:
- تسريب المياه، الحنفيات، المواسير، الصرف، انسداد الأحواض = plumbing.
- الكهرباء، القواطع، المفاتيح، الإنارة، الأسلاك = electrical.
- التكييف والتبريد = air_conditioning.
- الأبواب والأثاث والأخشاب = carpentry.
- الدهانات والحوائط = painting.
- الغسالات والثلاجات والأجهزة المنزلية = appliance_repair.
- السخانات = water_heater.
- مشكلة منزلية أخرى واضحة = general_maintenance.
- لا تستنتج منطقة غير مذكورة. إذا لم يذكر المستخدم المنطقة، اجعل area فارغًا واطلب منه اسم الحي والمحافظة في reply.
- إذا كانت المشكلة غير واضحة، اسأل سؤالًا واحدًا محددًا.
- إذا كان الموضوع خارج صيانة المنزل، وضّح تخصصك بلطف واجعل trade = null.
- في حالة شرر أو رائحة احتراق أو أسلاك مكشوفة: اطلب إبعاد الأشخاص وعدم لمس الأسلاك أو محاولة الإصلاح، وفصل القاطع فقط إذا كان ذلك آمنًا، والاستعانة بفني مؤهل.
- في حالة تسريب مياه شديد: اقترح غلق محبس المياه الرئيسي إذا أمكن بأمان.
- لا تطلب عنوان المنزل التفصيلي أو أي بيانات دفع أو كلمات مرور.
`;

function sendJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function cleanText(value, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseModelJson(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const value = JSON.parse(cleaned.slice(first, last + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeArabic(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function detectTrade(text) {
  const value = normalizeArabic(text);
  const groups = [
    ["plumbing", ["سباك", "سباكه", "تسريب", "حنفيه", "مواسير", "صرف", "حوض", "بالوعه", "انسداد"]],
    ["electrical", ["كهربا", "كهرباء", "شراره", "سلك", "اسلاك", "قاطع", "مفتاح نور", "فيشه"]],
    ["air_conditioning", ["تكييف", "مكيف", "تبريد", "فريون"]],
    ["carpentry", ["نجار", "نجاره", "باب", "دولاب", "اثاث", "خشب"]],
    ["painting", ["نقاش", "نقاشه", "دهان", "دهانات", "حائط", "حيطان"]],
    ["appliance_repair", ["غساله", "ثلاجه", "بوتاجاز", "فرن", "جهاز منزلي"]],
    ["water_heater", ["سخان", "سخانات"]],
  ];
  for (const [trade, words] of groups) {
    if (words.some(word => value.includes(normalizeArabic(word)))) return trade;
  }
  return null;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function areaSimilarity(artisan, userArea) {
  const wanted = normalizeArabic(userArea);
  if (!wanted) return { eligible: false, score: 0, reason: "" };

  const pieces = userArea.split(/[،,؛;/|]+/).map(normalizeArabic).filter(part => part.length >= 2);
  const serviceAreas = String(artisan.service_areas || "").split("||").map(normalizeArabic).filter(Boolean);
  const artisanDistrict = normalizeArabic(artisan.district);
  const artisanGovernorate = normalizeArabic(artisan.governorate);

  const matchesArea = value => Boolean(value) && (
    wanted.includes(value) || value.includes(wanted) ||
    pieces.some(piece => piece.includes(value) || value.includes(piece))
  );
  const districtMatch = matchesArea(artisanDistrict);
  const serviceAreaMatch = serviceAreas.some(matchesArea);
  const governorateMatch = Boolean(artisanGovernorate) && (
    wanted.includes(artisanGovernorate) ||
    pieces.some(piece => piece === artisanGovernorate || piece.includes(artisanGovernorate) || artisanGovernorate.includes(piece))
  );

  if (districtMatch) {
    return { eligible: true, score: 35, reason: "عنوان الحرفي في نفس المنطقة التي طلبتها" };
  }
  if (serviceAreaMatch) {
    return { eligible: true, score: 32, reason: "الحرفي مسجل ضمن مناطق الخدمة التي تغطي منطقتك" };
  }
  if (governorateMatch) {
    return { eligible: true, score: 15, reason: "يعمل داخل نفس المحافظة؛ أكّد معه تغطية الحي قبل الحجز" };
  }
  return { eligible: false, score: 0, reason: "" };
}

function rankArtisans(rows, area) {
  return rows.map(artisan => {
    const location = areaSimilarity(artisan, area);
    if (!location.eligible) return null;

    const rating = Math.max(0, Math.min(5, toNumber(artisan.rating)));
    const reviews = Math.max(0, toNumber(artisan.reviews_count));
    const completedJobs = Math.max(0, toNumber(artisan.completed_jobs));
    const availability = artisan.availability === "available" ? 10 : artisan.availability === "busy" ? 0 : 5;
    const score = location.score + (rating / 5 * 30)
      + Math.min(15, Math.log10(reviews + 1) / Math.log10(101) * 15)
      + Math.min(10, completedJobs / 100 * 10)
      + availability + 10;

    return {
      _rankScore: score,
      id: String(artisan.id),
      name: cleanText(artisan.name, 100),
      trade: artisan.trade,
      governorate: cleanText(artisan.governorate, 60),
      district: cleanText(artisan.district, 60),
      rating: Number(rating.toFixed(1)),
      reviews_count: reviews,
      completed_jobs: completedJobs,
      availability: ["available", "busy"].includes(artisan.availability) ? artisan.availability : "unknown",
      bio: cleanText(artisan.bio, 220),
      is_demo: cleanText(artisan.bio, 220).startsWith("بيانات تجريبية غير حقيقية"),
      phone: cleanText(artisan.phone, 30),
      whatsapp: cleanText(artisan.whatsapp, 30),
      match_reason: location.reason
    };
  }).filter(Boolean).sort((a, b) =>
    b._rankScore - a._rankScore ||
    b.rating - a.rating ||
    b.reviews_count - a.reviews_count ||
    b.completed_jobs - a.completed_jobs
  ).slice(0, 5).map(({ _rankScore, ...artisan }) => artisan);
}

async function getArtisans(db, trade) {
  const query = `
    SELECT
      a.id, a.name, a.trade, a.governorate, a.district,
      a.rating, a.reviews_count, a.completed_jobs, a.availability,
      a.bio, a.phone, a.whatsapp,
      GROUP_CONCAT(sa.area_name, '||') AS service_areas
    FROM artisans a
    LEFT JOIN artisan_service_areas sa ON sa.artisan_id = a.id
    WHERE a.trade = ? AND a.is_active = 1 AND a.is_verified = 1
    GROUP BY a.id
    LIMIT 300
  `;
  const result = await db.prepare(query).bind(trade).all();
  return Array.isArray(result.results) ? result.results : [];
}

async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AI || typeof env.AI.run !== "function") {
    return sendJson(503, {
      error: "Workers AI binding is missing",
      code: "ai_binding_missing"
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return sendJson(400, { error: "Invalid JSON body", code: "invalid_body" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendJson(400, { error: "Invalid request body", code: "invalid_body" });
  }

  const incoming = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  const messages = [];
  let totalLength = 0;
  for (const item of incoming) {
    if (!item || !["user", "assistant"].includes(item.role)) continue;
    const content = cleanText(item.content, MAX_MESSAGE_LENGTH);
    if (!content) continue;
    totalLength += content.length;
    messages.push({ role: item.role, content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user" || totalLength > MAX_TOTAL_LENGTH) {
    return sendJson(400, { error: "A valid user message is required", code: "invalid_messages" });
  }

  const suppliedArea = cleanText(body.area, 100);
  const conversationText = messages.map(message => message.role + ": " + message.content).join("\n");
  const analysisInput = [
    "المحادثة:",
    conversationText,
    "",
    "المنطقة التي كتبها المستخدم في خانة المنطقة (إن وجدت): " + (suppliedArea || "لم يكتب منطقة في الخانة"),
    "",
    "حلل المحادثة وأعد JSON فقط حسب التعليمات."
  ].join("\n");

  let analysis;
  try {
    const modelResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: analysisInput }
      ],
      max_completion_tokens: 500,
      temperature: 0.15,
      chat_template_kwargs: { enable_thinking: false }
    });
    const raw = modelResult?.response
      || modelResult?.choices?.[0]?.message?.content
      || modelResult?.result?.response
      || modelResult?.output_text
      || "";
    analysis = parseModelJson(raw);
  } catch (error) {
    console.error("Workers AI error:", error?.message || "unknown");
    return sendJson(502, { error: "AI provider is temporarily unavailable", code: "ai_unavailable" });
  }

  const allText = conversationText + " " + suppliedArea;
  const trade = ALLOWED_TRADES.has(analysis?.trade) ? analysis.trade : detectTrade(allText);
  const area = suppliedArea || cleanText(analysis?.area, 100);
  const issueSummary = cleanText(analysis?.issue_summary, 180);

  if (!trade) {
    const reply = cleanText(analysis?.reply, 1000) ||
      "احكيلي تفاصيل أكتر عن العطل، زي مكانه وإيه اللي بيحصل، عشان أحدد الحرفة المناسبة.";
    return sendJson(200, { reply, trade: null, area, recommendations: [] });
  }

  if (!area) {
    const reply = cleanText(analysis?.reply, 1000) ||
      "حدّد لي المنطقة أو الحي والمحافظة (مثلاً: مدينة نصر، القاهرة) عشان أبحث عن الحرفيين القريبين منك.";
    return sendJson(200, { reply: reply + (reply.includes("المنطقة") ? "" : "\nاكتب اسم الحي والمحافظة في خانة المنطقة فوق."), trade, area: "", recommendations: [] });
  }

  if (!env.DB || typeof env.DB.prepare !== "function") {
    return sendJson(200, {
      reply: "فهمت إن المشكلة تخص " + TRADE_LABELS[trade] + " في " + area + ". المساعد الذكي شغال، لكن قاعدة بيانات الحرفيين لسه مش متوصلة. وصّل D1 باسم DB وأضف بيانات الحرفيين الموثقين عشان أقدر أرتب لك أفضل خمسة.",
      trade,
      area,
      issue_summary: issueSummary,
      recommendations: [],
      code: "database_unconfigured"
    });
  }

  try {
    const records = await getArtisans(env.DB, trade);
    const recommendations = rankArtisans(records, area);
    if (!recommendations.length) {
      return sendJson(200, {
        reply: "حددت إنك محتاج " + TRADE_LABELS[trade] + " في " + area + "، لكن مفيش حاليًا حرفيين موثّقين مسجلين في قاعدة البيانات بيغطوا المنطقة دي. مش هعرض أسماء غير مؤكدة. جرّب منطقة قريبة أو ارجع بعد إضافة حرفيين جدد.",
        trade,
        area,
        issue_summary: issueSummary,
        recommendations: []
      });
    }

    const count = recommendations.length;
    const allDemo = recommendations.every(artisan => artisan.is_demo);
    const resultMessage = allDemo
      ? "فهمت المشكلة: " + (issueSummary || TRADE_LABELS[trade]) + ". لقيت لك " + count + " سجلات حرفيين تجريبية في " + area + " للاختبار فقط. الأسماء والتقييمات وأعداد الأعمال وهمية وليست لأشخاص حقيقيين، ولا يوجد اتصال أو حجز فعلي."
      : "فهمت المشكلة: " + (issueSummary || TRADE_LABELS[trade]) + ". لقيت لك " + count + " من الحرفيين المطابقين المسجلين في " + area + ". رتبتهم حسب تطابق المنطقة والتقييمات والأعمال السابقة والتوافر. الترشيح مش تأكيد لحجز أو موعد؛ اتواصل مع الفني لتأكيد التفاصيل.";
    return sendJson(200, {
      reply: resultMessage,
      trade,
      area,
      issue_summary: issueSummary,
      recommendations
    });
  } catch (error) {
    console.error("SAN3TY D1 query failed:", error?.message || "unknown");
    return sendJson(500, { error: "Could not search the artisan database", code: "database_query_failed" });
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" }
    });
  }
  return onRequestPost(context);
}
