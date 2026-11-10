/* Navegación entre secciones y tema claro/oscuro */
(function () {
  const root = document.getElementById("view");
  let pendingOpts = null;

  const ROUTES = {
    inicio: (o) => SMR.views.inicio(root, o),
    tutor: (o) => SMR.ai.view(root, o),
    subnetting: (o) => SMR.subnet.view(root, o),
    test: (o) => SMR.test.view(root, o),
    labs: (o) => SMR.views.labs(root, o),
    chuletas: (o) => SMR.views.chuletas(root, o),
    examen: (o) => SMR.views.examen(root, o),
    apuntes: (o) => SMR.views.apuntes(root, o),
    progreso: (o) => SMR.views.progreso(root, o),
  };

  function route() {
    const name = (location.hash || "#inicio").slice(1);
    const view = ROUTES[name] ? name : "inicio";
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    const opts = pendingOpts || {};
    pendingOpts = null;
    try {
      ROUTES[view](opts);
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="alert bad"><b>Algo ha fallado al cargar esta sección.</b><br>${SMR.ui.esc(err.message)}</div>`;
    }
    if (view !== "tutor") window.scrollTo(0, 0);
  }

  document.querySelectorAll("#nav button").forEach((b) => (b.onclick = () => {
    if (location.hash === "#" + b.dataset.view) route();
    else location.hash = b.dataset.view;
  }));
  window.addEventListener("hashchange", route);

  // Tema: auto → oscuro → claro
  function applyTheme() {
    const t = SMR.store.state.settings.theme || "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  document.getElementById("themeToggle").onclick = () => {
    const s = SMR.store.state.settings;
    s.theme = { auto: "dark", dark: "light", light: "auto" }[s.theme || "auto"];
    SMR.store.save();
    applyTheme();
    SMR.ui.toast({ auto: "🌓 Tema automático", dark: "🌙 Tema oscuro", light: "☀️ Tema claro" }[s.theme]);
  };

  SMR.app = {
    /** Abre una sección pasándole opciones (p. ej. un mensaje para el tutor). */
    open(view, opts) {
      pendingOpts = opts || null;
      if (location.hash === "#" + view) route();
      else location.hash = view;
    },
  };

  applyTheme();
  route();
})();
