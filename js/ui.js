/* Utilidades de interfaz */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, ms = 2600) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.getElementById("toasts").appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function modal(innerHTML, onMount) {
    const back = document.getElementById("modal");
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHTML}</div>`;
    back.hidden = false;
    const close = () => { back.hidden = true; back.innerHTML = ""; document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.onclick = (e) => { if (e.target === back) close(); };
    back.querySelectorAll("[data-close]").forEach((b) => (b.onclick = close));
    if (onMount) onMount(back.firstElementChild, close);
    const first = back.querySelector("input, textarea, button");
    if (first) first.focus();
    return close;
  }

  function confirmBox(text, okLabel = "Sí", danger = false) {
    return new Promise((resolve) => {
      modal(`<h3>${esc(text)}</h3><div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="ghost" data-close>Cancelar</button>
        <button class="${danger ? "danger" : ""}" id="cfOk">${esc(okLabel)}</button></div>`, (m, close) => {
        m.querySelector("#cfOk").onclick = () => { close(); resolve(true); };
        m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => resolve(false)));
      });
    });
  }

  function md(text) {
    if (window.marked && window.DOMPurify) {
      return DOMPurify.sanitize(marked.parse(text || "", { breaks: true, gfm: true }));
    }
    return esc(text).replace(/\n/g, "<br>");
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("📋 Copiado"); }
    catch { toast("No se pudo copiar"); }
  }

  function download(name, text, type = "text/plain") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function osBadge(os) {
    const label = { linux: "🐧 Linux", windows: "🪟 Windows", ambos: "Linux y Windows" }[os] || os;
    return `<span class="badge ${os}">${label}</span>`;
  }

  function cmdBlock(cmd) {
    return `<div class="cmd"><pre><code>${esc(cmd)}</code></pre><button class="ghost copy" data-copy="${esc(cmd)}" title="Copiar">📋</button></div>`;
  }

  function scoreClass(v) {
    if (v === null || v === undefined) return "";
    return v < 5 ? "lowc" : v < 7 ? "midc" : "highc";
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Normaliza respuestas cortas: minúsculas, sin tildes, sin espacios sobrantes. */
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  }

  // Botones de copiar (delegado)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (b) copy(b.getAttribute("data-copy"));
  });

  SMR.ui = { esc, toast, modal, confirmBox, md, copy, download, osBadge, cmdBlock, scoreClass, shuffle, norm };
})();
