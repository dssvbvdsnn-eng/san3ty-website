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
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3800);
  }

  const form = $("#chatForm"), input = $("#issue"), conversation = $("#conversation");
  const photo = $("#photo"), preview = $("#preview"), sendButton = $('button[type="submit"]', form || document);
  const quickButtons = $$("[data-prompt]");
  const history = [];
  let imageData = null, imageName = "", busy = false;
  const MAX_HISTORY = 10, MAX_IMAGE_BYTES = 1500000;

  function appendMessage(role, text) {
    if (!conversation) return null;
    $(".hint", conversation)?.remove();
    const node = document.createElement("div");
    node.className = "msg " + (role === "user" ? "user" : "ai");
    const title = document.createElement("b");
    title.textContent = role === "user" ? "أنت" : "✳ مساعد SAN3TY";
    const body = document.createElement("span");
    body.textContent = text;
    node.append(title, body);
    conversation.appendChild(node);
    conversation.scrollTop = conversation.scrollHeight;
    return node;
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
    if (sendButton) { sendButton.disabled = value; sendButton.textContent = value ? "…" : "↑"; }
    if (input) input.disabled = value;
    quickButtons.forEach(button => { button.disabled = value; });
    if (form) form.setAttribute("aria-busy", String(value));
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("تعذّر قراءة الصورة."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }
  async function prepareImage(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("اختار ملف صورة صالح.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("حجم الصورة كبير. اختار صورة أقل من 1.5 ميجابايت.");
    const original = await readAsDataURL(file);
    const image = new Image();
    image.src = original;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("الصورة غير مدعومة أو تالفة."));
    });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("المتصفح لم يتمكن من تجهيز الصورة.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }
  photo?.addEventListener("change", async () => {
    preview?.replaceChildren();
    imageData = null; imageName = "";
    const file = photo.files?.[0];
    if (!file) return;
    try {
      imageData = await prepareImage(file);
      imageName = file.name;
      const image = document.createElement("img");
      image.src = imageData; image.alt = "معاينة الصورة المرفقة";
      const caption = document.createElement("span");
      caption.textContent = "تم تجهيز " + file.name + " للإرسال مع الرسالة.";
      preview?.append(image, caption);
    } catch (error) {
      showToast(error.message || "تعذّر تجهيز الصورة.");
      photo.value = "";
    }
  });

  function friendlyApiError(status, code) {
    if (code === "missing_api_key") return "ربط الذكاء الاصطناعي لم يكتمل بعد: أضف OPENAI_API_KEY في إعدادات Vercel ثم أعد النشر.";
    if (code === "rate_limited" || status === 429) return "الطلبات كثيرة حاليًا أو رصيد API غير كافٍ. راجع حدود الاستخدام والفوترة في منصة OpenAI.";
    if (code === "invalid_api_key") return "مفتاح OpenAI API غير صحيح. راجع قيمة OPENAI_API_KEY في Vercel.";
    if (status === 404) return "واجهة الذكاء الاصطناعي غير موجودة على هذه الاستضافة. يلزم نشر المشروع على Vercel لتشغيل /api/chat.";
    if (status === 413) return "الطلب أو الصورة أكبر من الحد المسموح. جرّب صورة أصغر.";
    return "حصلت مشكلة أثناء الاتصال بالمساعد. جرّب مرة أخرى بعد قليل.";
  }
  async function askAssistant(text, attachedImage) {
    history.push({ role: "user", content: text });
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-MAX_HISTORY), image: attachedImage || undefined })
    });
    let data = {};
    try { data = await response.json(); } catch { /* Static-hosting 404 may return HTML */ }
    if (!response.ok) {
      const error = new Error(friendlyApiError(response.status, data.code));
      error.status = response.status;
      throw error;
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("المساعد رجع ردًا فارغًا. جرّب صياغة السؤال بطريقة مختلفة.");
    history.push({ role: "assistant", content: data.reply });
    while (history.length > MAX_HISTORY) history.shift();
    return data.reply;
  }

  async function submitIssue(value) {
    const description = String(value || "").trim();
    if (busy) return;
    if (!description && !imageData) { input?.focus(); showToast("اكتب وصف المشكلة أو أرفق صورة أولًا."); return; }
    const userText = description || "من فضلك افحص الصورة المرفقة وحدد نوع مشكلة الصيانة المحتملة.";
    const pendingImage = imageData, pendingName = imageName;
    appendMessage("user", userText + (pendingName ? "\n📎 " + pendingName : ""));
    setBusy(true);
    const typing = showTyping();
    if (input) input.value = "";
    try {
      const reply = await askAssistant(userText, pendingImage);
      typing?.remove();
      appendMessage("assistant", reply);
      if (pendingImage) {
        imageData = null; imageName = "";
        if (photo) photo.value = "";
        preview?.replaceChildren();
      }
    } catch (error) {
      typing?.remove();
      const message = error.message || "تعذّر الاتصال بالمساعد.";
      appendMessage("assistant", message);
      showToast(message);
      imageData = pendingImage; imageName = pendingName;
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