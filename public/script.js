(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const menu = $("#menu"), nav = $("#links"), header = $(".header");
  const progress = $("#scrollProgress"), backToTop = $("#backToTop"), toast = $("#siteToast");

  function closeMenu() {
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded", "false");
    menu?.setAttribute("aria-label", "فتح القائمة");
  }
  menu?.addEventListener("click", () => {
    const opening = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(opening));
    menu.setAttribute("aria-label", opening ? "إغلاق القائمة" : "فتح القائمة");
    nav?.classList.toggle("open", opening);
  });
  $$("a", nav || document).forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeMenu(); });
  document.addEventListener("click", event => {
    if (nav?.classList.contains("open") && !nav.contains(event.target) && !menu?.contains(event.target)) closeMenu();
  });

  let scrollFrame = 0;
  function updateScrollUI() {
    scrollFrame = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (progress) progress.style.transform = "scaleX(" + ratio + ")";
    header?.classList.toggle("scrolled", window.scrollY > 12);
    backToTop?.classList.toggle("visible", window.scrollY > 520);
  }
  window.addEventListener("scroll", () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollUI);
  }, { passive: true });
  updateScrollUI();

  const revealItems = $$(".reveal");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    revealItems.forEach(item => item.classList.add("visible"));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
    revealItems.forEach((item, index) => {
      if (item.matches(".issue,.step,.value,.rev")) item.style.transitionDelay = ((index % 4) * 65) + "ms";
      revealObserver.observe(item);
    });
  }

  if ("IntersectionObserver" in window) {
    const sectionLinks = $$('nav a[href^="#"]');
    const sections = sectionLinks.map(link => $(link.getAttribute("href"))).filter(Boolean);
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        sectionLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === ("#" + entry.target.id)));
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach(section => sectionObserver.observe(section));
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 4200);
  }

  const form = $("#chatForm"), input = $("#issue"), conversation = $("#conversation");
  const areaInput = $("#serviceArea"), resultsBox = $("#artisanResults");
  const sendButton = $('button[type="submit"]', form || document);
  const quickButtons = $$("[data-prompt]");
  const history = [];
  const MAX_HISTORY = 10;
  let busy = false;

  const tradeLabels = {
    plumbing: "سباكة",
    electrical: "كهرباء",
    air_conditioning: "تكييف",
    carpentry: "نجارة",
    painting: "نقاشة ودهانات",
    appliance_repair: "صيانة أجهزة منزلية",
    water_heater: "سخانات",
    general_maintenance: "صيانة منزلية"
  };

  function appendMessage(role, message) {
    if (!conversation) return;
    $(".hint", conversation)?.remove();
    const node = document.createElement("div");
    node.className = "msg " + (role === "user" ? "user" : "ai");
    const title = document.createElement("b");
    title.textContent = role === "user" ? "أنت" : "✳ مساعد SAN3TY";
    const body = document.createElement("span");
    body.textContent = String(message || "");
    node.append(title, body);
    conversation.appendChild(node);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function showTyping() {
    const node = document.createElement("div");
    node.className = "msg ai typing";
    node.setAttribute("aria-label", "المساعد يكتب");
    for (let i = 0; i < 3; i++) node.appendChild(document.createElement("i"));
    conversation?.appendChild(node);
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
    return node;
  }

  function setBusy(value) {
    busy = value;
    if (sendButton) {
      sendButton.disabled = value;
      sendButton.textContent = value ? "…" : "↑";
    }
    if (input) input.disabled = value;
    if (areaInput) areaInput.disabled = value;
    quickButtons.forEach(button => { button.disabled = value; });
    if (form) form.setAttribute("aria-busy", String(value));
  }

  function friendlyError(status, code) {
    if (code === "ai_binding_missing") return "خدمة الذكاء الاصطناعي لسه مش متوصلة. راجع إعداد AI في Cloudflare Pages حسب دليل تشغيل المشروع.";
    if (code === "database_binding_missing") return "المساعد شغال، لكن قاعدة بيانات الحرفيين مش متوصلة. أضف قاعدة D1 واربطها بالاسم DB في Cloudflare.";
    if (code === "rate_limited" || status === 429) return "وصلنا للحد المؤقت للاستخدام المجاني. جرّب تاني بعد شوية.";
    if (status === 404) return "عنوان المساعد غير متاح على الاستضافة الحالية. لازم نشر المشروع على Cloudflare Pages لتشغيل الشات.";
    if (status === 503) return "خدمة المساعد أو قاعدة البيانات غير مفعّلة بعد. راجع إعدادات Cloudflare الموضحة في README.";
    return "حصلت مشكلة أثناء الاتصال بالمساعد. جرّب مرة تانية بعد قليل.";
  }

  async function askAssistant(message) {
    const outgoing = history.concat([{ role: "user", content: message }]).slice(-MAX_HISTORY);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: outgoing,
        area: String(areaInput?.value || "").trim()
      })
    });

    let data = {};
    try { data = await response.json(); } catch { /* Static hosting may return an HTML 404 page */ }
    if (!response.ok) {
      const error = new Error(friendlyError(response.status, data.code));
      error.status = response.status;
      throw error;
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("المساعد لم يرجع ردًا واضحًا. جرّب وصف المشكلة بطريقة أبسط.");
    }

    history.splice(0, history.length, ...outgoing, { role: "assistant", content: data.reply });
    while (history.length > MAX_HISTORY) history.shift();
    return data;
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[^0-9+]/g, "");
  }

  function makeElement(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderArtisans(recommendations, trade, area) {
    if (!resultsBox) return;
    resultsBox.replaceChildren();
    if (!Array.isArray(recommendations) || !recommendations.length) return;

    const heading = makeElement("div", "recommendation-heading");
    const allDemo = recommendations.every(artisan => artisan.is_demo === true || String(artisan.bio || "").includes("بيانات تجريبية غير حقيقية"));
    const title = makeElement("strong", "", allDemo ? "نتائج تجريبية للاختبار فقط" : "الحرفيون الأنسب لطلبك");
    const subtitle = makeElement("span", "", (tradeLabels[trade] || "الخدمة المطلوبة") + " · " + (area || "منطقتك"));
    heading.append(title, subtitle);
    resultsBox.appendChild(heading);

    recommendations.slice(0, 5).forEach((artisan, index) => {
      const card = makeElement("article", "artisan-card");
      const top = makeElement("div", "artisan-card-top");
      const identity = makeElement("div", "artisan-identity");
      const name = makeElement("h4", "", (index + 1) + ". " + (artisan.name || "حرفي مسجل"));
      const subtitleLine = makeElement("p", "", [tradeLabels[artisan.trade] || tradeLabels[trade] || "خدمات صيانة", artisan.district, artisan.governorate].filter(Boolean).join(" · "));
      identity.append(name, subtitleLine);
      const demoRecord = artisan.is_demo === true || String(artisan.bio || "").includes("بيانات تجريبية غير حقيقية");
      top.append(identity, makeElement("span", demoRecord ? "demo-label" : "verified-label", demoRecord ? "بيانات تجريبية" : "✓ موثّق"));
      card.appendChild(top);

      const stats = makeElement("div", "artisan-stats");
      stats.append(
        makeElement("span", "", "★ " + (Number(artisan.rating || 0).toFixed(1)) + " (" + Number(artisan.reviews_count || 0) + " تقييم)"),
        makeElement("span", "", "✓ " + Number(artisan.completed_jobs || 0) + " عمل مكتمل"),
        makeElement("span", "", artisan.availability === "available" ? "● متاح" : artisan.availability === "busy" ? "● مشغول" : "● التوافر غير محدد")
      );
      card.appendChild(stats);

      if (artisan.match_reason) card.appendChild(makeElement("p", "match-reason", artisan.match_reason));
      if (artisan.bio) card.appendChild(makeElement("p", "artisan-bio", artisan.bio));

      const actions = makeElement("div", "artisan-actions");
      const phone = normalizePhone(artisan.phone);
      const whatsapp = normalizePhone(artisan.whatsapp || artisan.phone).replace(/^\+/, "");
      if (phone) {
        const call = makeElement("a", "artisan-contact", "اتصال");
        call.href = "tel:" + phone;
        actions.appendChild(call);
      }
      if (whatsapp) {
        const wa = makeElement("a", "artisan-contact whatsapp", "واتساب");
        wa.href = "https://wa.me/" + whatsapp;
        wa.target = "_blank";
        wa.rel = "noopener noreferrer";
        actions.appendChild(wa);
      }
      if (actions.childNodes.length) card.appendChild(actions);
      resultsBox.appendChild(card);
    });
    conversation?.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }

  async function submitIssue(value) {
    const message = String(value || "").trim();
    if (busy) return;
    if (!message) {
      input?.focus();
      showToast("اكتب وصف المشكلة الأول.");
      return;
    }

    appendMessage("user", message);
    if (input) input.value = "";
    setBusy(true);
    const typing = showTyping();

    try {
      const data = await askAssistant(message);
      typing?.remove();
      appendMessage("assistant", data.reply);
      if (Array.isArray(data.recommendations) && data.recommendations.length) {
        renderArtisans(data.recommendations, data.trade, data.area);
      } else if (resultsBox) {
        resultsBox.replaceChildren();
      }
      if (data.code === "database_unconfigured") showToast("المحادثة تعمل؛ يلزم توصيل قاعدة بيانات الحرفيين لتفعيل الترشيحات.");
    } catch (error) {
      typing?.remove();
      appendMessage("assistant", error.message || "تعذّر الاتصال بالمساعد.");
      showToast(error.message || "تعذّر الاتصال بالمساعد.");
    } finally {
      setBusy(false);
      conversation?.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
      input?.focus();
    }
  }

  form?.addEventListener("submit", event => {
    event.preventDefault();
    submitIssue(input?.value || "");
  });
  quickButtons.forEach(button => button.addEventListener("click", () => submitIssue(button.dataset.prompt || "")));
})();