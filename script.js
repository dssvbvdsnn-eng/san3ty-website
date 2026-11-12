(() => {
  const menu = document.getElementById("menu");
  const links = document.getElementById("links");
  menu?.addEventListener("click", () => links.classList.toggle("open"));
  links?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add("visible"));
  }

  const form = document.getElementById("chatForm");
  const input = document.getElementById("issue");
  const conversation = document.getElementById("conversation");
  const photo = document.getElementById("photo");
  const preview = document.getElementById("preview");

  const detectService = value => {
    const s = value.toLowerCase();
    if (/كهرب|فيش|مفتاح|نور|شرار|قاطع|سلك/.test(s)) return ["كهرباء منزلية", "فني كهرباء متخصص"];
    if (/تكييف|مكيف|تبريد|بيبرّد|بارد|فريون/.test(s)) return ["صيانة تكييفات", "فني تكييف مناسب"];
    if (/مياه|ماء|حنفي|حوض|تسريب|ماسور|صرف|سباك/.test(s)) return ["سباكة منزلية", "فني سباكة مناسب"];
    return ["صيانة منزلية — يلزم تحديد التفاصيل", "اقتراح حرفي بعد فهم نوع العطل"];
  };

  function addMessage(kind, title, text) {
    const node = document.createElement("div");
    node.className = "msg " + kind;
    const who = document.createElement("b");
    who.textContent = title;
    const body = document.createElement("span");
    body.textContent = text;
    node.append(who, body);
    conversation.appendChild(node);
  }

  function submitIssue(value) {
    const description = value.trim();
    if (!description) return;
    conversation.querySelector(".hint")?.remove();
    addMessage("user", "أنت", description);
    const [service, recommendation] = detectService(description);
    addMessage("ai", "✳ مساعد SAN3TY", "وصلني وصف المشكلة. دي محاكاة توضيحية لطريقة فهم الطلب، وليست تشخيصًا فنيًا فعليًا.");
    const result = document.createElement("div");
    result.className = "result-box";
    const label = document.createElement("small");
    label.textContent = "الخدمة المقترحة في النموذج";
    const strong = document.createElement("strong");
    strong.textContent = service;
    const extra = document.createElement("div");
    extra.textContent = recommendation + " · بعد ذلك تتم مقارنة الموقع والتخصص والتقييمات والمواعيد المتاحة.";
    result.append(label, strong, extra);
    conversation.appendChild(result);
    conversation.scrollTop = conversation.scrollHeight;
    input.value = "";
  }

  form?.addEventListener("submit", event => {
    event.preventDefault();
    submitIssue(input.value);
  });
  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => submitIssue(button.dataset.prompt || ""));
  });

  photo?.addEventListener("change", () => {
    preview.replaceChildren();
    const file = photo.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      preview.textContent = "من فضلك اختار ملف صورة.";
      return;
    }
    const image = document.createElement("img");
    image.alt = "معاينة الصورة المرفقة";
    image.src = URL.createObjectURL(file);
    const note = document.createElement("span");
    note.textContent = "تمت معاينة الصورة محليًا فقط؛ لا يتم رفعها أو تحليلها.";
    preview.append(image, note);
  });
})();
