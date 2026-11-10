/* Vistas: inicio, laboratorios, chuletas, plan de examen, apuntes y progreso */
(function () {
  const { esc, toast, osBadge, cmdBlock, scoreClass } = SMR.ui;
  const go = (hash) => { location.hash = hash; };

  function topicBars(stats) {
    return `<div class="bars">${Object.entries(SMR.TOPICS).map(([k, t]) => {
      const v = stats[k];
      const w = v.avg === null ? 0 : v.avg * 10;
      return `<div class="bar-row"><span>${t.icon} ${t.name}</span><div class="bar ${scoreClass(v.avg)}"><i style="width:${w}%"></i></div><b class="small">${v.avg === null ? "—" : v.avg.toFixed(1)}</b></div>`;
    }).join("")}</div>`;
  }

  function daysUntil(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d) - t) / 86400000);
  }
  const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", opts);
  };

  /** Lanza el repaso de un fallo concreto en la sección adecuada. */
  function reviewFallo(f) {
    if (f.qid) { SMR.app.open("test", { review: 2 }); return; }
    if (f.key.startsWith("sub:")) { SMR.app.open("subnetting"); return; }
    SMR.app.open("tutor", { prompt: `Repasemos este fallo que tengo pendiente: «${f.text}». Hazme una pregunta para ver si ya lo entiendo.` });
  }

  // ================= INICIO =================
  function inicio(root) {
    const st = SMR.store.state;
    const stats = SMR.store.topicStats();
    const scored = st.sessions.filter((s) => typeof s.score === "number");
    const avg = scored.length ? scored.slice(-15).reduce((a, s) => a + s.score, 0) / Math.min(15, scored.length) : null;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
    const wk = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(weekAgo.getDate()).padStart(2, "0")}`;
    const thisWeek = st.sessions.filter((s) => s.date >= wk).length;
    const pend = SMR.store.pendingList();
    const plan = st.plan;
    const todayPlan = plan && plan.days.find((d) => d.date === SMR.store.today());
    const h = new Date().getHours();
    const saludo = h < 13 ? "¡Buenos días!" : h < 20 ? "¡Buenas tardes!" : "¡Buenas noches!";

    const tiles = [
      ["🤖", "Explícame algo", "El tutor IA te lo explica corto y con un ejercicio.", () => SMR.app.open("tutor")],
      ["📝", "Hazme un test", "5–15 preguntas con nota y resumen de fallos.", () => go("#test")],
      ["🧮", "Subnetting", "Ejercicios autocorregidos que suben de nivel.", () => go("#subnetting")],
      ["🧪", "Laboratorio", "Prácticas guiadas para máquinas virtuales.", () => go("#labs")],
      ["📅", "Prepárame el examen", "Plan por días empezando por lo más flojo.", () => go("#examen")],
      ["✅", "Corrígeme esto", "Pega tu script o respuesta y te la corrijo.", () => SMR.app.open("tutor", { fill: "Corrígeme esto:\n" })],
    ];

    root.innerHTML = `
      <div class="hero"><h1>${saludo} ¿Qué toca hoy?</h1><p>Sesiones cortas de 15–30 minutos. Poco a poco, pero todos los días. 💪</p></div>

      <div class="grid stats" style="margin-top:18px">
        ${[["🔥", SMR.store.streak(), SMR.store.streak() === 1 ? "día seguido" : "días seguidos"], ["📚", thisWeek, "sesiones esta semana"], ["⭐", avg === null ? "—" : avg.toFixed(1), "nota media"], ["🎯", pend.length, "fallos pendientes"]]
          .map(([i, v, l]) => `<div class="card stat"><div class="stat-icon">${i}</div><div><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div></div>`).join("")}
      </div>

      ${pend.length ? `
      <div class="card" style="margin-top:18px;border-left:6px solid var(--warn)">
        <div class="row between"><h3 style="margin:0">⏱️ Calentamiento: repasa antes de empezar</h3><span class="muted small">2 minutos</span></div>
        <ul class="check-list" style="margin-top:8px">${pend.slice(0, 2).map((f, i) => `<li><span>${SMR.TOPICS[f.topic] ? SMR.TOPICS[f.topic].icon : "❗"}</span><div class="grow"><b>${esc(f.text)}</b><div class="small muted">Fallado ${f.count} ${f.count === 1 ? "vez" : "veces"}</div></div><button class="small secondary" data-rev="${i}">Repasar</button></li>`).join("")}</ul>
      </div>` : ""}

      ${plan ? `
      <div class="card" style="margin-top:18px">
        <div class="row between"><h3 style="margin:0">📅 Examen: ${fmtDate(plan.examDate, { weekday: "long", day: "numeric", month: "long" })}</h3>
        <span class="badge ${daysUntil(plan.examDate) <= 3 ? "danger" : "ok"}">${daysUntil(plan.examDate) > 0 ? `Faltan ${daysUntil(plan.examDate)} días` : daysUntil(plan.examDate) === 0 ? "¡Es hoy! 🍀" : "Ya pasó"}</span></div>
        ${todayPlan ? `<p style="margin-top:10px"><b>Hoy toca:</b> ${todayPlan.tasks.map((t) => esc(t.label)).join(" + ")}</p><button class="small" onclick="location.hash='#examen'">Ver plan ➡️</button>` : `<p class="muted" style="margin-top:10px">Hoy no hay tarea en el plan.</p>`}
      </div>` : ""}

      <h2 style="margin-top:28px">¿Qué quieres hacer?</h2>
      <div class="grid cols-3">${tiles.map(([i, t, d], idx) => `<button class="tile" data-tile="${idx}"><span class="tile-icon">${i}</span><span class="tile-title">${t}</span><span class="tile-desc">${d}</span></button>`).join("")}</div>

      <div class="card" style="margin-top:22px">
        <div class="row between"><h3 style="margin:0">📈 Cómo vas por temas</h3><a href="#progreso" class="small">Ver todo</a></div>
        <div style="margin-top:14px">${topicBars(stats)}</div>
      </div>`;

    root.querySelectorAll("[data-tile]").forEach((b) => (b.onclick = tiles[Number(b.dataset.tile)][3]));
    root.querySelectorAll("[data-rev]").forEach((b) => (b.onclick = () => reviewFallo(pend[Number(b.dataset.rev)])));
  }

  // ================= LABORATORIOS =================
  let openLab = null;
  function labs(root) {
    const st = SMR.store.state;
    if (openLab) return labDetail(root, SMR.LABS.find((l) => l.id === openLab));
    root.innerHTML = `
      <div class="page-head"><h1>🧪 Laboratorios</h1><p>Prácticas para montar en máquinas virtuales: objetivo, pasos y cómo comprobar que funciona.</p></div>
      <div class="alert warn" style="margin-bottom:16px">🛟 Haz siempre una <b>instantánea</b> de la VM antes de empezar. Si algo se rompe, vuelves atrás en segundos.</div>
      <div class="grid cols-2">
        ${SMR.LABS.map((l) => {
          const done = Object.keys(st.labs[l.id] || {}).length;
          const total = l.steps.length + l.check.length;
          return `<button class="tile" data-lab="${l.id}"><span class="tile-icon">${l.icon}</span><span class="tile-title">${esc(l.title)}</span>
            <span class="tile-desc">${esc(l.goal)}</span>
            <span class="row small" style="margin-top:6px"><span class="badge">${SMR.TOPICS[l.topic].icon} ${SMR.TOPICS[l.topic].name}</span><span class="badge">⏱️ ${l.time}</span><span class="badge">${l.level}</span>${done ? `<span class="badge ok">${done}/${total} pasos</span>` : ""}</span></button>`;
        }).join("")}
        <button class="tile" id="customLab" style="border-style:dashed"><span class="tile-icon">✨</span><span class="tile-title">Pide un laboratorio a medida</span><span class="tile-desc">El tutor IA te diseña una práctica sobre lo que necesites (requiere clave de API).</span></button>
      </div>`;
    root.querySelectorAll("[data-lab]").forEach((b) => (b.onclick = () => { openLab = b.dataset.lab; labs(root); window.scrollTo(0, 0); }));
    root.querySelector("#customLab").onclick = () => SMR.app.open("tutor", { fill: "Propón un laboratorio para montar en máquinas virtuales sobre " });
  }

  function labDetail(root, l) {
    const st = SMR.store.state;
    const marks = st.labs[l.id] || (st.labs[l.id] = {});
    const defOs = l.topic === "windows" ? "windows" : "linux";
    const item = (it, key) => `
      <li class="${marks[key] ? "done" : ""}"><input type="checkbox" data-key="${key}" ${marks[key] ? "checked" : ""} aria-label="Hecho">
        <div class="step-body grow"><div>${esc(it.text)}</div>
        ${it.cmds ? `<div class="row small" style="margin:6px 0 2px">${osBadge(it.os || defOs)}</div>${it.cmds.map(cmdBlock).join("")}` : ""}
        ${it.code ? `<pre><code>${esc(it.code)}</code></pre>` : ""}</div></li>`;
    const total = l.steps.length + l.check.length;
    const done = Object.keys(marks).length;
    root.innerHTML = `
      <button class="ghost small" id="back">⬅️ Todos los laboratorios</button>
      <div class="page-head" style="margin-top:14px"><h1>${l.icon} ${esc(l.title)}</h1>
        <div class="row small"><span class="badge">${SMR.TOPICS[l.topic].icon} ${SMR.TOPICS[l.topic].name}</span><span class="badge">⏱️ ${l.time}</span><span class="badge">${l.level}</span></div></div>
      <div class="row" style="margin-bottom:16px"><div class="progress grow"><i style="width:${(done / total) * 100}%"></i></div><b class="small">${done}/${total}</b></div>
      <div class="grid cols-2" style="margin-bottom:16px">
        <div class="card"><h3>🎯 Objetivo</h3><p style="margin:0">${esc(l.goal)}</p></div>
        <div class="card"><h3>🧰 Necesitas</h3><p style="margin:0">${esc(l.needs)}</p></div>
      </div>
      <div class="card"><h3>🛠️ Pasos</h3><ul class="check-list">${l.steps.map((s, i) => item(s, "s" + i)).join("")}</ul></div>
      <div class="card" style="margin-top:16px"><h3>🔎 Cómo comprobar que funciona</h3><ul class="check-list">${l.check.map((s, i) => item(s, "c" + i)).join("")}</ul></div>
      ${l.extra ? `<div class="alert info" style="margin-top:16px">🏅 ${esc(l.extra)}</div>` : ""}
      <div class="row" style="margin-top:18px">
        <button class="secondary" id="help">🤖 Me he atascado: ayuda del tutor</button>
        <button class="ghost" id="resetLab">↺ Reiniciar checklist</button>
      </div>`;
    root.querySelector("#back").onclick = () => { openLab = null; labs(root); };
    root.querySelectorAll("[data-key]").forEach((c) => (c.onchange = () => {
      if (c.checked) marks[c.dataset.key] = true; else delete marks[c.dataset.key];
      const nowDone = Object.keys(marks).length;
      if (nowDone === total) {
        SMR.store.addSession({ topic: l.topic, title: "Laboratorio completado: " + l.title, score: null, source: "lab" });
        toast("🏆 ¡Laboratorio completado! Guardado en tu progreso.", 3500);
      } else SMR.store.save();
      labDetail(root, l);
    }));
    root.querySelector("#help").onclick = () => {
      const next = [...l.steps.map((s, i) => ["s" + i, s]), ...l.check.map((s, i) => ["c" + i, s])].find(([k]) => !marks[k]);
      SMR.app.open("tutor", { fill: `Estoy haciendo el laboratorio «${l.title}» y me he atascado${next ? ` en este paso: «${next[1].text}»` : ""}. El error que me sale es: ` });
    };
    root.querySelector("#resetLab").onclick = () => { st.labs[l.id] = {}; SMR.store.save(); labDetail(root, l); };
  }

  // ================= CHULETAS =================
  const chu = { tab: "puertos", os: "todos", q: "", hide: false };
  function chuletas(root) {
    const cmds = SMR.COMMANDS.filter((c) => (chu.os === "todos" || c.os === chu.os || c.os === "ambos") &&
      (!chu.q || SMR.ui.norm(c.cmd + " " + c.desc + " " + c.cat).includes(SMR.ui.norm(chu.q))));
    const cats = [...new Set(cmds.map((c) => c.cat))];
    root.innerHTML = `
      <div class="page-head"><h1>📌 Chuletas</h1><p>Lo que tienes que saberte sí o sí, a un clic.</p></div>
      <div class="chips" style="margin-bottom:16px">
        <button class="chip ${chu.tab === "puertos" ? "on" : ""}" data-tab="puertos">🔌 Puertos y protocolos</button>
        <button class="chip ${chu.tab === "comandos" ? "on" : ""}" data-tab="comandos">⌨️ Comandos</button>
      </div>
      ${chu.tab === "puertos" ? `
        <div class="card">
          <div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Puertos más preguntados</h3>
            <button class="small ${chu.hide ? "" : "secondary"}" id="hide">${chu.hide ? "👀 Mostrar todos" : "🙈 Ocultar para practicar"}</button></div>
          ${chu.hide ? `<p class="muted small">Piensa el puerto y toca la casilla para comprobarlo.</p>` : ""}
          <div class="table-wrap"><table class="data"><tr><th>Protocolo</th><th>Puerto</th><th>Transporte</th><th>Para qué sirve</th></tr>
          ${SMR.PORTS.map((p) => `<tr><td><b>${esc(p[0])}</b></td><td class="mono">${chu.hide ? `<button class="small ghost" data-reveal="${esc(p[1])}">❓</button>` : esc(p[1])}</td><td>${esc(p[2])}</td><td>${esc(p[3])}</td></tr>`).join("")}</table></div>
        </div>` : `
        <div class="row" style="margin-bottom:14px">
          <input id="q" class="grow" placeholder="🔎 Buscar comando (ej. ip, usuario, disco…)" value="${esc(chu.q)}" style="max-width:420px">
          <div class="chips">${[["todos", "Todos"], ["linux", "🐧 Linux"], ["windows", "🪟 Windows"]].map(([k, n]) => `<button class="chip ${chu.os === k ? "on" : ""}" data-os="${k}">${n}</button>`).join("")}</div>
        </div>
        <div class="alert warn small" style="margin-bottom:14px">⚠️ Los comandos marcados como <span class="badge danger">Destructivo</span> borran datos. Practícalos <b>solo en una máquina virtual</b> y con una instantánea hecha.</div>
        ${cats.length ? cats.map((cat) => `<div class="card" style="margin-bottom:14px"><h3>${esc(cat)}</h3>
          ${cmds.filter((c) => c.cat === cat).map((c) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)">
            <div class="row small">${osBadge(c.os)}${c.danger ? '<span class="badge danger">⚠️ Destructivo · solo en VM</span>' : ""}</div>
            ${cmdBlock(c.cmd)}<div class="small muted">${esc(c.desc)}</div></div>`).join("")}</div>`).join("")
          : `<div class="empty"><span class="big-emoji">🔍</span>No hay comandos que coincidan.</div>`}`}`;
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { chu.tab = b.dataset.tab; chuletas(root); }));
    root.querySelectorAll("[data-os]").forEach((b) => (b.onclick = () => { chu.os = b.dataset.os; chuletas(root); }));
    const hide = root.querySelector("#hide");
    if (hide) hide.onclick = () => { chu.hide = !chu.hide; chuletas(root); };
    root.querySelectorAll("[data-reveal]").forEach((b) => (b.onclick = () => { b.outerHTML = `<b>${esc(b.dataset.reveal)}</b>`; }));
    const q = root.querySelector("#q");
    if (q) {
      q.oninput = () => { chu.q = q.value; const pos = q.selectionStart; chuletas(root); const n = root.querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); };
    }
  }

  // ================= PLAN DE EXAMEN =================
  const planForm = { topics: new Set(), minutes: 20 };
  function taskFor(topic, n, st) {
    const name = SMR.TOPICS[topic].name;
    if (topic === "subnetting") {
      return { topic, view: "subnetting", label: `🧮 Subnetting nivel ${Math.min(4, st.subnet.level + (n > 1 ? 1 : 0))}` };
    }
    const variants = [
      { view: "tutor", label: `🤖 Tutor IA: lo que menos domino de ${name}`, prompt: `Prepárame para el examen de ${name}: empieza por lo que tengo más flojo y pon un ejercicio.` },
      { view: "test", label: `📝 Test de ${name}` },
    ];
    const lab = SMR.LABS.find((l) => l.topic === topic);
    if (lab) variants.push({ view: "labs", label: `🧪 Laboratorio: ${lab.title}`, lab: lab.id });
    return Object.assign({ topic }, variants[n % variants.length]);
  }

  function generatePlan(examDate, topics, minutes) {
    const st = SMR.store.state;
    const stats = SMR.store.topicStats();
    const left = daysUntil(examDate);
    const nDays = Math.min(left, 30);
    // Más peso a lo más flojo (sin datos = 5)
    const ordered = topics.slice().sort((a, b) => (stats[a].avg ?? 5) - (stats[b].avg ?? 5));
    const weights = ordered.map((t) => Math.max(1, Math.round((10 - (stats[t].avg ?? 5)) / 2.5)));
    // Por rondas: los temas flojos aparecen en más rondas, y se intercalan para no repetir días seguidos
    const seq = [];
    const counts = {};
    let r = 0;
    while (seq.length < nDays) {
      let added = 0;
      ordered.forEach((t, i) => { if (r < weights[i] && seq.length < nDays) { seq.push(t); added++; } });
      r = added ? r + 1 : 0;
    }
    const days = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + (left - nDays));
    for (let i = 0; i < nDays; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let tasks;
      if (i === nDays - 1) {
        tasks = [{ topic: null, view: "test", label: "🏁 Simulacro: test mixto de todos los temas", mixed: true }, { topic: null, view: "progreso", label: "🎯 Repasa tus fallos pendientes" }];
      } else if (i > 0 && i % 4 === 3) {
        tasks = [{ topic: null, view: "progreso", label: "🔁 Repaso de fallos pendientes" }];
      } else {
        const t = seq[i];
        counts[t] = (counts[t] || 0) + 1;
        tasks = [taskFor(t, counts[t] - 1, st)];
      }
      days.push({ date, tasks: tasks.map((t) => Object.assign(t, { done: false })) });
    }
    return { examDate, topics, minutes, days, truncated: left > 30 };
  }

  function examen(root) {
    const st = SMR.store.state;
    const plan = st.plan;
    if (!plan) {
      const min = SMR.store.today();
      root.innerHTML = `
        <div class="page-head"><h1>📅 Prepárame el examen</h1><p>Dime la fecha y los temas y te hago un plan por días con sesiones cortas, empezando por lo más flojo.</p></div>
        <div class="card stack" style="max-width:760px">
          <label class="field"><span>1. ¿Qué día es el examen?</span><input type="date" id="date" min="${min}" style="max-width:240px"></label>
          <div><span class="muted small" style="font-weight:700">2. ¿Qué temas entran?</span>
            <div class="chips" style="margin-top:8px">${Object.entries(SMR.TOPICS).map(([k, t]) => `<button class="chip ${planForm.topics.has(k) ? "on" : ""}" data-topic="${k}">${t.icon} ${t.name}</button>`).join("")}</div></div>
          <div><span class="muted small" style="font-weight:700">3. ¿Cuánto tiempo tienes al día?</span>
            <div class="chips" style="margin-top:8px">${[15, 20, 30].map((m) => `<button class="chip ${planForm.minutes === m ? "on" : ""}" data-min="${m}">⏱️ ${m} min</button>`).join("")}</div></div>
          <div><button class="big" id="gen">✨ Crear mi plan</button></div>
        </div>`;
      root.querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => { const k = b.dataset.topic; planForm.topics.has(k) ? planForm.topics.delete(k) : planForm.topics.add(k); b.classList.toggle("on"); }));
      root.querySelectorAll("[data-min]").forEach((b) => (b.onclick = () => { planForm.minutes = Number(b.dataset.min); root.querySelectorAll("[data-min]").forEach((x) => x.classList.toggle("on", x === b)); }));
      root.querySelector("#gen").onclick = () => {
        const date = root.querySelector("#date").value;
        if (!date) { toast("📆 Elige la fecha del examen"); return; }
        if (daysUntil(date) < 1) { toast("El examen tiene que ser a partir de mañana"); return; }
        if (!planForm.topics.size) { toast("Elige al menos un tema"); return; }
        st.plan = generatePlan(date, [...planForm.topics], planForm.minutes);
        SMR.store.save();
        toast("✅ ¡Plan creado!");
        examen(root);
      };
      return;
    }
    const left = daysUntil(plan.examDate);
    const done = plan.days.reduce((a, d) => a + d.tasks.filter((t) => t.done).length, 0);
    const total = plan.days.reduce((a, d) => a + d.tasks.length, 0);
    const today = SMR.store.today();
    root.innerHTML = `
      <div class="hero" style="margin-bottom:18px"><h1>${left > 0 ? `Faltan ${left} ${left === 1 ? "día" : "días"}` : left === 0 ? "¡Hoy es el examen! 🍀" : "El examen ya pasó"}</h1>
        <p>Examen el ${fmtDate(plan.examDate, { weekday: "long", day: "numeric", month: "long" })} · ${plan.topics.map((t) => SMR.TOPICS[t].icon + " " + SMR.TOPICS[t].name).join(" · ")} · ${plan.minutes} min/día</p></div>
      <div class="row" style="margin-bottom:18px"><div class="progress grow"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><b class="small">${done}/${total} tareas</b>
        <button class="ghost small" id="delPlan">🗑️ Borrar plan</button></div>
      ${plan.truncated ? `<div class="alert info" style="margin-bottom:14px">El examen está lejos: el plan cubre los últimos 30 días. Hasta entonces, practica lo que quieras.</div>` : ""}
      <div class="timeline">${plan.days.map((d, di) => {
        const allDone = d.tasks.every((t) => t.done);
        const past = d.date < today;
        return `<div class="tl-item ${allDone ? "done" : ""} ${d.date === today ? "today" : ""}">
          <div class="card" style="padding:14px 16px;${past && !allDone ? "opacity:.75" : ""}">
            <div class="row between"><b>${d.date === today ? "👉 Hoy · " : ""}${fmtDate(d.date)}</b><span class="muted small">${plan.minutes} min</span></div>
            ${d.tasks.map((t, ti) => `<div class="row" style="margin-top:8px"><input type="checkbox" data-d="${di}" data-t="${ti}" ${t.done ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--ok)" aria-label="Hecho">
              <span class="grow" style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.label)}</span>
              <button class="small secondary" data-start="${di}:${ti}">Empezar</button></div>`).join("")}
          </div></div>`;
      }).join("")}</div>`;
    root.querySelector("#delPlan").onclick = async () => {
      if (await SMR.ui.confirmBox("¿Borrar el plan de examen?", "Borrar", true)) { st.plan = null; SMR.store.save(); examen(root); }
    };
    root.querySelectorAll("[data-d]").forEach((c) => (c.onchange = () => {
      plan.days[c.dataset.d].tasks[c.dataset.t].done = c.checked;
      SMR.store.save();
      examen(root);
    }));
    root.querySelectorAll("[data-start]").forEach((b) => (b.onclick = () => {
      const [di, ti] = b.dataset.start.split(":").map(Number);
      const t = plan.days[di].tasks[ti];
      if (t.view === "tutor") SMR.app.open("tutor", { fill: t.prompt });
      else if (t.view === "test") SMR.app.open("test", t.mixed ? { topics: plan.topics } : { topic: t.topic });
      else if (t.view === "labs") { openLab = t.lab; go("#labs"); }
      else go("#" + t.view);
    }));
  }

  // ================= APUNTES =================
  function apuntes(root) {
    const st = SMR.store.state;
    const totalChars = st.apuntes.reduce((a, x) => a + x.text.length, 0);
    root.innerHTML = `
      <div class="page-head"><h1>📚 Mis apuntes</h1><p>Pega aquí los apuntes o enunciados del Moodle. El tutor IA los usará para explicarte y preguntarte <b>sobre lo que se da en tu clase</b>.</p></div>
      <div class="grid cols-2">
        <div class="card stack">
          <h3>➕ Añadir apuntes</h3>
          <label class="field"><span>Título</span><input id="aName" placeholder="Ej. UT3 · Direccionamiento IPv4"></label>
          <label class="field"><span>Texto</span><textarea id="aText" rows="8" placeholder="Pega aquí el texto (desde el PDF, Moodle, Word…)"></textarea></label>
          <div class="row"><button id="addA">💾 Guardar</button>
            <label class="btn ghost" style="background:transparent;color:var(--text);border:1px solid var(--line)">📂 Subir .txt / .md<input type="file" id="aFile" accept=".txt,.md,text/plain,text/markdown" multiple hidden></label></div>
          <p class="muted small">¿Tienes un PDF? Ábrelo, selecciona todo (Ctrl+A), copia y pégalo aquí.</p>
        </div>
        <div class="card">
          <div class="row between"><h3 style="margin:0">🗂️ Guardados (${st.apuntes.length})</h3><span class="muted small">${totalChars.toLocaleString("es-ES")} caracteres</span></div>
          ${totalChars > 200000 ? `<div class="alert warn small" style="margin-top:10px">Tienes muchos apuntes guardados: el tutor los lee todos en cada mensaje, así que cada respuesta cuesta más. Borra los que no necesites para el tema de hoy.</div>` : ""}
          ${st.apuntes.length ? `<ul class="check-list">${st.apuntes.map((a, i) => `<li><span>📄</span><div class="grow"><b>${esc(a.name)}</b><div class="small muted">${a.date} · ${a.text.length.toLocaleString("es-ES")} caracteres</div>
            <div class="small" style="margin-top:4px">${esc(a.text.slice(0, 140))}${a.text.length > 140 ? "…" : ""}</div>
            <div class="row" style="margin-top:8px"><button class="small secondary" data-ask="${i}">📝 Pregúntame sobre esto</button><button class="small ghost" data-del="${i}">🗑️</button></div></div></li>`).join("")}</ul>`
          : `<div class="empty"><span class="big-emoji">📭</span>Aún no hay apuntes.<br>El tutor usará información general y te avisará.</div>`}
        </div>
      </div>`;
    const add = (name, text) => {
      st.apuntes.push({ id: Date.now() + Math.random(), name: name || "Apuntes sin título", text, date: SMR.store.today() });
      SMR.store.save();
    };
    root.querySelector("#addA").onclick = () => {
      const text = root.querySelector("#aText").value.trim();
      if (!text) { toast("Pega algo de texto primero"); return; }
      add(root.querySelector("#aName").value.trim(), text);
      toast("✅ Apuntes guardados");
      apuntes(root);
    };
    root.querySelector("#aFile").onchange = async (e) => {
      for (const f of e.target.files) add(f.name.replace(/\.(txt|md)$/i, ""), (await f.text()).trim());
      toast(`✅ ${e.target.files.length} archivo(s) añadidos`);
      apuntes(root);
    };
    root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (await SMR.ui.confirmBox("¿Borrar estos apuntes?", "Borrar", true)) { st.apuntes.splice(Number(b.dataset.del), 1); SMR.store.save(); apuntes(root); }
    }));
    root.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => SMR.app.open("tutor", { prompt: `Hazme un test sobre mis apuntes «${st.apuntes[Number(b.dataset.ask)].name}».` })));
  }

  // ================= PROGRESO =================
  function progreso(root) {
    const st = SMR.store.state;
    const pend = SMR.store.pendingList();
    const sessions = st.sessions.slice().reverse();
    const srcIcon = { test: "📝", subnetting: "🧮", tutor: "🤖", lab: "🧪" };
    root.innerHTML = `
      <div class="page-head row between"><div><h1>📈 Progreso</h1><p>Se guarda automáticamente en este navegador.</p></div>
        <div class="row"><button class="secondary small" id="expMd">⬇️ Descargar progreso.md</button><button class="ghost small" id="more">⋯ Copia de seguridad</button></div></div>
      <div class="grid cols-2">
        <div class="card"><h3>📊 Nota media por tema</h3><div style="margin-top:12px">${topicBars(SMR.store.topicStats())}</div></div>
        <div class="card"><h3>🎯 Fallos que se repiten</h3>
          ${pend.length ? `<ul class="check-list">${pend.slice(0, 12).map((f, i) => `<li><span>${SMR.TOPICS[f.topic] ? SMR.TOPICS[f.topic].icon : "❗"}</span><div class="grow"><b>${esc(f.text)}</b><div class="small muted">×${f.count} · último ${f.last}</div></div>
            <div class="row"><button class="small secondary" data-rev="${i}">Repasar</button><button class="small ghost" data-ok="${i}" title="Ya lo domino">✔</button></div></li>`).join("")}</ul>`
          : `<div class="empty"><span class="big-emoji">🎉</span>¡No tienes fallos pendientes!</div>`}
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h3>🗓️ Historial de sesiones</h3>
        ${sessions.length ? `<div class="table-wrap"><table class="data"><tr><th>Fecha</th><th>Actividad</th><th>Tema</th><th>Nota</th><th>Fallos</th></tr>
        ${sessions.slice(0, 60).map((s) => `<tr><td class="small">${s.date}</td><td>${srcIcon[s.source] || "•"} ${esc(s.title || "")}</td><td>${SMR.TOPICS[s.topic] ? SMR.TOPICS[s.topic].icon + " " + SMR.TOPICS[s.topic].name : "—"}</td>
          <td>${typeof s.score === "number" ? `<span class="badge ${s.score >= 5 ? "ok" : "danger"}">${s.score.toLocaleString("es-ES")}</span>` : "—"}</td>
          <td class="small">${esc((s.fallos || []).map((f) => (typeof f === "string" ? f : f.text)).join(", ")) || "—"}</td></tr>`).join("")}</table></div>`
        : `<div class="empty"><span class="big-emoji">🌱</span>Todavía no hay sesiones. ¡Empieza con un test o un ejercicio de subnetting!</div>`}
      </div>`;
    root.querySelectorAll("[data-rev]").forEach((b) => (b.onclick = () => reviewFallo(pend[Number(b.dataset.rev)])));
    root.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => { SMR.store.resolveFallo(pend[Number(b.dataset.ok)].key); toast("💪 ¡Fallo superado!"); progreso(root); }));
    root.querySelector("#expMd").onclick = () => SMR.ui.download("progreso.md", SMR.store.toMarkdown(), "text/markdown");
    root.querySelector("#more").onclick = () => SMR.ui.modal(`
      <h2>💾 Copia de seguridad</h2>
      <p>Tu progreso vive en este navegador. Descarga una copia para pasarlo a otro dispositivo (la clave de API no se incluye).</p>
      <div class="stack">
        <button id="expJson">⬇️ Descargar copia (.json)</button>
        <label class="btn secondary" style="background:var(--primary-soft);color:var(--primary)">⬆️ Restaurar copia<input type="file" id="impJson" accept=".json,application/json" hidden></label>
        <hr><button class="danger" id="wipe">🗑️ Borrar todo mi progreso</button>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="ghost" data-close>Cerrar</button></div>`, (m, close) => {
      m.querySelector("#expJson").onclick = () => SMR.ui.download(`tutor-smr-copia-${SMR.store.today()}.json`, SMR.store.exportJSON(), "application/json");
      m.querySelector("#impJson").onchange = async (e) => {
        try { SMR.store.importJSON(await e.target.files[0].text()); toast("✅ Copia restaurada"); close(); progreso(root); }
        catch (err) { toast("❌ Ese archivo no es una copia válida"); }
      };
      m.querySelector("#wipe").onclick = async () => {
        close();
        if (await SMR.ui.confirmBox("¿Seguro que quieres borrar TODO tu progreso? No se puede deshacer.", "Borrar todo", true)) { SMR.store.reset(); toast("Progreso borrado"); progreso(root); }
      };
    });
  }

  SMR.views = { inicio, labs, chuletas, examen, apuntes, progreso, openLab: (id) => { openLab = id; } };
})();
