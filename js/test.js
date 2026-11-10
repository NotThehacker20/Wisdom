/* Tests tipo examen: preguntas de una en una, corrección explicada y nota final */
(function () {
  const { esc, norm, shuffle } = SMR.ui;
  let run = null;          // { qs, i, answers:[{ok, given}], title, topicKey }
  let setup = { topics: new Set(["redes", "subnetting"]), count: 10 };

  function start(qs, title, topicKey) {
    run = { qs, i: 0, answers: [], title, topicKey, answered: false };
  }

  function startFromSetup() {
    const pool = SMR.QUESTIONS.filter((q) => setup.topics.has(q.t));
    if (!pool.length) { SMR.ui.toast("Elige al menos un tema"); return false; }
    // Prioriza preguntas falladas antes
    const pend = new Set(SMR.store.pendingList().map((p) => p.qid).filter(Boolean));
    const failed = shuffle(pool.filter((q) => pend.has(q.id)));
    const rest = shuffle(pool.filter((q) => !pend.has(q.id)));
    const qs = [...failed.slice(0, Math.ceil(setup.count / 3)), ...rest].slice(0, setup.count);
    const topicKey = setup.topics.size === 1 ? [...setup.topics][0] : null;
    start(shuffle(qs), "Test: " + [...setup.topics].map((t) => SMR.TOPICS[t].name).join(", "), topicKey);
    return true;
  }

  /** Repasa fallos pendientes que vengan del banco de preguntas. */
  function startReview(n = 2) {
    const ids = SMR.store.pendingList().map((p) => p.qid).filter(Boolean).slice(0, n);
    const qs = ids.map((id) => SMR.QUESTIONS.find((q) => q.id === id)).filter(Boolean);
    if (!qs.length) return false;
    start(qs, "Repaso de fallos", null);
    run.review = true;
    return true;
  }

  function setupHTML() {
    const counts = {};
    SMR.QUESTIONS.forEach((q) => (counts[q.t] = (counts[q.t] || 0) + 1));
    return `
      <div class="page-head"><h1>📝 Hazme un test</h1><p>Preguntas de una en una, con corrección explicada y nota al final. Las que fallaste antes salen primero.</p></div>
      <div class="card stack" style="max-width:760px">
        <h3>1. ¿De qué temas?</h3>
        <div class="chips">${Object.entries(SMR.TOPICS).filter(([k]) => counts[k]).map(([k, t]) => `<button class="chip ${setup.topics.has(k) ? "on" : ""}" data-topic="${k}">${t.icon} ${t.name} <span class="muted small">(${counts[k]})</span></button>`).join("")}</div>
        <h3 style="margin-top:20px">2. ¿Cuántas preguntas?</h3>
        <div class="chips">${[5, 10, 15].map((n) => `<button class="chip ${setup.count === n ? "on" : ""}" data-count="${n}">${n} preguntas · ~${Math.round(n * 0.7)} min</button>`).join("")}</div>
        <div style="margin-top:22px"><button class="big" id="go">▶️ Empezar test</button></div>
      </div>
      <p class="muted small" style="margin-top:14px">¿Quieres preguntas sobre tus propios apuntes? Usa el <a href="#tutor">Tutor IA</a> y pídele «Hazme un test».</p>`;
  }

  function questionHTML() {
    const q = run.qs[run.i];
    const t = SMR.TOPICS[q.t];
    const pct = Math.round((run.i / run.qs.length) * 100);
    const body = q.type === "mc"
      ? `<div class="options">${q.o.map((o, i) => `<button class="option" data-opt="${i}"><span class="letter">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>`
      : `<div class="row"><input id="shortAns" class="grow" placeholder="Escribe tu respuesta…" autocomplete="off" spellcheck="false"><button id="sendShort">Responder</button></div>`;
    return `
      <div class="page-head row between"><div><h1>📝 ${esc(run.title)}</h1></div>
        <button class="ghost small" id="quit">✖ Salir</button></div>
      <div class="row" style="margin-bottom:14px"><span class="badge">${t.icon} ${t.name}</span><span class="muted small">Pregunta ${run.i + 1} de ${run.qs.length}</span><div class="progress grow"><i style="width:${pct}%"></i></div></div>
      <div class="card q-card">
        <div class="q-text">${esc(q.q)}</div>
        ${body}
        <div id="fbBox" style="margin-top:16px"></div>
      </div>`;
  }

  function answer(root, given, ok, chosenIdx) {
    if (run.answered) return;
    run.answered = true;
    const q = run.qs[run.i];
    run.answers.push({ ok, given });
    if (q.type === "mc") {
      root.querySelectorAll("[data-opt]").forEach((b) => {
        const i = Number(b.dataset.opt);
        b.disabled = true;
        if (i === q.a) b.classList.add("right");
        if (i === chosenIdx && !ok) b.classList.add("wrong");
      });
    } else {
      const inp = root.querySelector("#shortAns");
      inp.disabled = true;
      inp.classList.add(ok ? "ok" : "bad");
      root.querySelector("#sendShort").disabled = true;
    }
    if (ok && run.review) SMR.store.resolveFallo(q.tag);
    const correctText = q.type === "mc" ? q.o[q.a] : q.a[0];
    const last = run.i === run.qs.length - 1;
    root.querySelector("#fbBox").innerHTML = `
      <div class="alert ${ok ? "ok" : "bad"}">
        <p><b>${ok ? "✔ ¡Correcto!" : "✘ No es correcto."}</b>${ok ? "" : ` La respuesta buena es: <b>${esc(correctText)}</b>.`}</p>
        <p><b>Por qué:</b> ${esc(q.e)}</p>
      </div>
      <div style="margin-top:14px"><button id="next" class="big">${last ? "🏁 Ver mi nota" : "Siguiente ➡️"}</button></div>`;
    const nb = root.querySelector("#next");
    nb.focus();
    nb.onclick = () => { run.i++; run.answered = false; render(root); };
  }

  function resultHTML() {
    const ok = run.answers.filter((a) => a.ok).length;
    const total = run.qs.length;
    const score = Math.round((ok / total) * 100) / 10;
    const color = score >= 7 ? "var(--ok)" : score >= 5 ? "var(--warn)" : "var(--bad)";
    const msg = score >= 9 ? "¡Brutal! Lo tienes dominado. 🏆" : score >= 7 ? "¡Muy bien! Repasa los fallos y listo. 💪" : score >= 5 ? "Aprobado, pero hay cosas que afianzar. 👍" : "Toca repasar. Mira los fallos de abajo con calma. 📚";
    const fails = run.qs.map((q, i) => ({ q, a: run.answers[i] })).filter((x) => !x.a.ok);
    return `
      <div class="page-head"><h1>🏁 Resultado</h1><p>${esc(run.title)}</p></div>
      <div class="grid cols-2">
        <div class="card center">
          <div class="ring" style="--p:${score * 10};--c:${color}"><div><div><b>${score.toLocaleString("es-ES")}</b><span class="muted">/10</span></div></div></div>
          <h3 style="margin-top:14px">${ok} de ${total} correctas</h3>
          <p class="muted">${msg}</p>
          <div class="row" style="justify-content:center"><button id="again">🔁 Otro test</button><a class="btn secondary" href="#inicio" style="background:var(--primary-soft);color:var(--primary)">🏠 Inicio</a></div>
        </div>
        <div class="card">
          <h3>📋 Resumen de fallos</h3>
          ${fails.length ? `<ul class="check-list">${fails.map(({ q, a }) => `<li><span>❌</span><div><b>${esc(q.q)}</b><div class="small">Tu respuesta: <span class="mono">${esc(a.given || "(vacía)")}</span> · Correcta: <b>${esc(q.type === "mc" ? q.o[q.a] : q.a[0])}</b></div><div class="small muted">${esc(q.e)}</div></div></li>`).join("")}</ul>` : `<div class="empty"><span class="big-emoji">🎯</span>¡Ningún fallo!</div>`}
        </div>
      </div>`;
  }

  function finish() {
    const ok = run.answers.filter((a) => a.ok).length;
    const score = Math.round((ok / run.qs.length) * 100) / 10;
    const fallos = run.qs.map((q, i) => ({ q, a: run.answers[i] })).filter((x) => !x.a.ok)
      .map(({ q }) => ({ topic: q.t, key: q.tag, text: q.tag, qid: q.id }));
    // Una sesión por tema implicado, para que las medias por tema sean útiles
    const byTopic = {};
    run.qs.forEach((q, i) => { (byTopic[q.t] = byTopic[q.t] || { ok: 0, n: 0 }); byTopic[q.t].n++; if (run.answers[i].ok) byTopic[q.t].ok++; });
    Object.entries(byTopic).forEach(([t, v]) => {
      SMR.store.addSession({
        topic: t, title: run.title + (Object.keys(byTopic).length > 1 ? ` (${v.ok}/${v.n})` : ""), source: "test",
        score: Math.round((v.ok / v.n) * 100) / 10, fallos: fallos.filter((f) => f.topic === t),
      });
    });
    run.saved = true;
    return score;
  }

  function render(root) {
    if (!run) {
      root.innerHTML = setupHTML();
      root.querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => { const k = b.dataset.topic; setup.topics.has(k) ? setup.topics.delete(k) : setup.topics.add(k); render(root); }));
      root.querySelectorAll("[data-count]").forEach((b) => (b.onclick = () => { setup.count = Number(b.dataset.count); render(root); }));
      root.querySelector("#go").onclick = () => { if (startFromSetup()) render(root); };
      return;
    }
    if (run.i >= run.qs.length) {
      if (!run.saved) finish();
      root.innerHTML = resultHTML();
      root.querySelector("#again").onclick = () => { run = null; render(root); };
      return;
    }
    root.innerHTML = questionHTML();
    const q = run.qs[run.i];
    root.querySelector("#quit").onclick = async () => {
      if (run.answers.length === 0 || (await SMR.ui.confirmBox("¿Salir del test? No se guardará la nota.", "Salir"))) { run = null; render(root); }
    };
    if (q.type === "mc") {
      root.querySelectorAll("[data-opt]").forEach((b) => (b.onclick = () => {
        const i = Number(b.dataset.opt);
        answer(root, q.o[i], i === q.a, i);
      }));
    } else {
      const inp = root.querySelector("#shortAns");
      const send = () => {
        if (!inp.value.trim()) { inp.focus(); return; }
        const ok = q.a.some((a) => norm(a) === norm(inp.value));
        answer(root, inp.value, ok);
      };
      root.querySelector("#sendShort").onclick = send;
      inp.onkeydown = (e) => { if (e.key === "Enter") send(); };
      inp.focus();
    }
  }

  SMR.test = {
    view(root, opts = {}) {
      if (opts.review) { if (!startReview(opts.review)) { SMR.ui.toast("No hay fallos de test pendientes 🎉"); } }
      if (opts.topic) { setup.topics = new Set([opts.topic]); run = null; }
      if (opts.topics) { setup.topics = new Set(opts.topics); setup.count = 15; run = null; }
      render(root);
    },
    hasReview() { return SMR.store.pendingList().some((p) => p.qid); },
  };
})();
