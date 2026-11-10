/* Guardado del progreso en el navegador (localStorage) + exportar a progreso.md */
(function () {
  const KEY = "tutorSMR.v1";

  const DEFAULT = () => ({
    version: 1,
    sessions: [],          // { date, topic, title, score (0-10|null), fallos:[], source }
    pending: {},           // fallos que se repiten: { key: { text, topic, qid, count, last } }
    subnet: { level: 1, history: [] },
    plan: null,            // { examDate, topics, minutes, days:[{date, tasks:[{topic,label,view,done}]}] }
    apuntes: [],           // { id, name, text, date }
    labs: {},              // { labId: { stepKey: true } }
    settings: { apiKey: "", model: "claude-opus-5-5", effort: "medium", theme: "auto" },
    chat: { messages: [], display: [] },
    activity: [],          // fechas "YYYY-MM-DD" con actividad
  });

  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? Object.assign(DEFAULT(), JSON.parse(raw)) : DEFAULT();
  } catch (e) {
    state = DEFAULT();
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { SMR.ui && SMR.ui.toast("⚠️ No se pudo guardar (¿almacenamiento lleno o modo privado?)"); }
  }

  function markActive() {
    const t = today();
    if (!state.activity.includes(t)) state.activity.push(t);
  }

  function addFallo(topic, key, text, qid) {
    const p = state.pending[key] || { text, topic, qid: qid || null, count: 0 };
    p.count += 1;
    p.text = text;
    p.last = today();
    state.pending[key] = p;
  }

  function resolveFallo(key) {
    delete state.pending[key];
    save();
  }

  /** Añade una sesión (test o tutor IA). */
  function addSession({ topic, title, score, fallos = [], source }) {
    state.sessions.push({ date: today(), topic, title, score, fallos, source });
    fallos.forEach((f) => addFallo(f.topic || topic, f.key || f.text, f.text, f.qid));
    markActive();
    save();
  }

  /** Subnetting: acumula aciertos/fallos del día en una sola sesión. */
  function recordSubnet(correct, fallosLabels) {
    const t = today();
    let s = state.sessions.find((x) => x.date === t && x.source === "subnetting");
    if (!s) {
      s = { date: t, topic: "subnetting", title: "Práctica de subnetting", score: 0, fallos: [], source: "subnetting", ok: 0, total: 0 };
      state.sessions.push(s);
    }
    s.total += 1;
    if (correct) s.ok += 1;
    s.score = Math.round((s.ok / s.total) * 100) / 10;
    fallosLabels.forEach((label) => {
      if (!s.fallos.includes(label)) s.fallos.push(label);
      addFallo("subnetting", "sub:" + label, "Subnetting: " + label);
    });
    state.subnet.history.push(correct ? 1 : 0);
    state.subnet.history = state.subnet.history.slice(-20);
    markActive();
    save();
  }

  /** Nota media por tema (últimas 10 sesiones de cada tema). */
  function topicStats() {
    const out = {};
    Object.keys(SMR.TOPICS).forEach((k) => {
      const list = state.sessions.filter((s) => s.topic === k && typeof s.score === "number").slice(-10);
      out[k] = list.length ? { avg: list.reduce((a, s) => a + s.score, 0) / list.length, n: list.length } : { avg: null, n: 0 };
    });
    return out;
  }

  function streak() {
    const set = new Set(state.activity);
    let n = 0;
    const d = new Date();
    if (!set.has(today())) d.setDate(d.getDate() - 1); // la racha sigue viva si hoy aún no has estudiado
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!set.has(k)) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function pendingList() {
    return Object.entries(state.pending)
      .map(([key, v]) => Object.assign({ key }, v))
      .sort((a, b) => b.count - a.count || (b.last || "").localeCompare(a.last || ""));
  }

  function toMarkdown() {
    const lines = ["# Progreso · Tutor SMR", "", `_Exportado el ${today()}_`, "", "## Sesiones", "", "| Fecha | Tema | Actividad | Nota | Fallos |", "|---|---|---|---|---|"];
    state.sessions.forEach((s) => {
      const topic = (SMR.TOPICS[s.topic] || {}).name || s.topic;
      const nota = typeof s.score === "number" ? s.score.toFixed(1) + "/10" : "—";
      const fallos = (s.fallos || []).map((f) => (typeof f === "string" ? f : f.text)).join("; ").replace(/\|/g, "/") || "—";
      lines.push(`| ${s.date} | ${topic} | ${(s.title || "").replace(/\|/g, "/")} | ${nota} | ${fallos} |`);
    });
    lines.push("", "## Fallos que se repiten", "");
    const p = pendingList();
    if (!p.length) lines.push("Ninguno pendiente. 🎉");
    p.forEach((f) => lines.push(`- **${(SMR.TOPICS[f.topic] || {}).name || f.topic}** · ${f.text} (×${f.count}, último: ${f.last})`));
    lines.push("", "## Nota media por tema", "");
    const st = topicStats();
    Object.entries(st).forEach(([k, v]) => lines.push(`- ${SMR.TOPICS[k].name}: ${v.avg === null ? "sin datos" : v.avg.toFixed(1) + "/10 (" + v.n + " sesiones)"}`));
    return lines.join("\n") + "\n";
  }

  /** Resumen corto para el tutor IA. */
  function summaryForAI() {
    const st = topicStats();
    const notas = Object.entries(st).filter(([, v]) => v.avg !== null).map(([k, v]) => `${SMR.TOPICS[k].name}: ${v.avg.toFixed(1)}/10`);
    const fallos = pendingList().slice(0, 8).map((f) => `- ${f.text} (×${f.count})`);
    const last = state.sessions.slice(-5).map((s) => `- ${s.date} · ${(SMR.TOPICS[s.topic] || {}).name || s.topic} · ${s.title || ""} · ${typeof s.score === "number" ? s.score.toFixed(1) + "/10" : "sin nota"}`);
    return [
      "Notas medias: " + (notas.length ? notas.join(", ") : "todavía no hay datos."),
      "Fallos pendientes que se repiten:\n" + (fallos.length ? fallos.join("\n") : "- ninguno"),
      "Últimas sesiones:\n" + (last.length ? last.join("\n") : "- ninguna"),
      state.plan ? `Tiene un examen el ${state.plan.examDate} de: ${state.plan.topics.map((t) => SMR.TOPICS[t].name).join(", ")}.` : "",
    ].filter(Boolean).join("\n\n");
  }

  function exportJSON() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.settings.apiKey = ""; // nunca exportamos la clave
    return JSON.stringify(copy, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.sessions)) throw new Error("Archivo no válido");
    const key = state.settings.apiKey;
    state = Object.assign(DEFAULT(), data);
    state.settings.apiKey = key;
    save();
  }

  function reset() {
    const key = state.settings.apiKey;
    state = DEFAULT();
    state.settings.apiKey = key;
    save();
  }

  SMR.store = {
    get state() { return state; },
    save, today, addSession, recordSubnet, resolveFallo, addFallo, topicStats, streak, pendingList,
    toMarkdown, summaryForAI, exportJSON, importJSON, reset, markActive,
  };
})();
