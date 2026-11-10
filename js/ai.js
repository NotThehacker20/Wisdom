/* Tutor IA: chat con Claude usando el prompt de tutor-smr.md como instrucciones de sistema */
(function () {
  const { esc, md, toast } = SMR.ui;

  const MODELS = {
    "claude-opus-5-5": { name: "Claude Opus 5.5", desc: "El más completo. Recomendado.", fallbacks: true },
    "claude-sonnet-5-5": { name: "Claude Sonnet 5.5", desc: "Muy bueno y más barato.", fallbacks: true },
    "claude-haiku-5-5": { name: "Claude Haiku 5.5", desc: "Rápido y muy barato.", fallbacks: false },
  };
  const EFFORTS = {
    low: "⚡ Rápidas",
    medium: "⚖️ Equilibradas",
    high: "🧠 Más pensadas",
  };

  const MODES = [
    { icon: "🔁", label: "Repasar fallos", send: "¡Hola! Empecemos la sesión: repasa primero 1 o 2 de mis fallos pendientes." },
    { icon: "💡", label: "Explícame…", fill: "Explícame " },
    { icon: "📝", label: "Hazme un test", fill: "Hazme un test de " },
    { icon: "📅", label: "Prepárame el examen", fill: "Prepárame el examen. Es el día  y entran estos temas: " },
    { icon: "🧮", label: "Subnetting", send: "Vamos con subnetting. Ponme un ejercicio de mi nivel." },
    { icon: "✅", label: "Corrígeme esto", fill: "Corrígeme esto:\n```\n\n```", caret: -4 },
    { icon: "🧪", label: "Laboratorio", fill: "Propón un laboratorio para montar en máquinas virtuales sobre " },
  ];

  const SUGGESTIONS = [
    ["🌐", "Explícame qué es una VLAN con un ejemplo de clase"],
    ["🔌", "Hazme un test de puertos y protocolos"],
    ["🐧", "Explícame los permisos de Linux (chmod) con ejemplos"],
    ["📜", "Corrígeme este script:\n```bash\n#!/bin/bash\nnombre = $1\nif [ $nombre == \"\" ] then\n  echo \"Falta el nombre\"\nfi\n```"],
  ];

  let streaming = null; // stream activo

  function settings() { return SMR.store.state.settings; }
  function chat() { return SMR.store.state.chat; }

  function buildSystem() {
    const st = SMR.store.state;
    const apuntes = st.apuntes.length
      ? st.apuntes.map((a) => `### ${a.name}\n${a.text}`).join("\n\n")
      : "(El alumno todavía no ha añadido apuntes. Si te pregunta algo de clase, avisa de que usas información general y anímale a pegar sus apuntes en la sección «Mis apuntes».)";
    return [
      SMR.TUTOR_PROMPT,
      `## Cómo funciona esta app (léelo: sustituye a los archivos)
- Estás dentro de una aplicación web llamada «Tutor SMR». No tienes acceso a archivos ni a herramientas.
- La carpeta \`apuntes/\` de tus instrucciones son los apuntes que aparecen más abajo, y \`progreso.md\` es el resumen de progreso de abajo. La app guarda el progreso por su cuenta cuando el alumno pulsa «Terminar sesión»: no le pidas que edite ningún archivo.
- La app tiene además secciones propias: Subnetting (ejercicios autocorregidos), Tests, Laboratorios, Chuletas y Plan de examen. Puedes recomendárselas cuando encajen.
- Responde en Markdown: frases cortas, listas, tablas pequeñas y bloques de código con el lenguaje indicado (\`\`\`bash, \`\`\`powershell…). Nada de muros de texto: el alumno suele leer desde el móvil.
- Hoy es ${SMR.store.today()}.`,
      `## Progreso del alumno (equivale a progreso.md)\n${SMR.store.summaryForAI()}`,
      `## Apuntes del alumno (equivale a la carpeta apuntes/)\n${apuntes}`,
    ].join("\n\n");
  }

  function client() {
    return new Anthropic({ apiKey: settings().apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  function baseParams(messages) {
    const s = settings();
    const p = {
      model: s.model,
      max_tokens: 64000,
      system: buildSystem(),
      messages,
      cache_control: { type: "ephemeral" },
      output_config: { effort: s.effort || "medium" },
    };
    if ((MODELS[s.model] || {}).fallbacks) {
      // Si el modelo rechaza la petición por un falso positivo de seguridad, la API reintenta con otro modelo.
      p.betas = ["server-side-fallback-2026-07-01"];
      p.fallbacks = "default";
    }
    return p;
  }

  function errorText(err) {
    if (err instanceof Anthropic.AuthenticationError) return "🔑 La clave de API no es válida. Revísala en ⚙️ Ajustes.";
    if (err instanceof Anthropic.PermissionDeniedError) return "🚫 Tu clave no tiene permiso para usar este modelo. Prueba con otro en ⚙️ Ajustes.";
    if (err instanceof Anthropic.NotFoundError) return "❓ Modelo no encontrado. Elige otro en ⚙️ Ajustes.";
    if (err instanceof Anthropic.RateLimitError) return "⏳ Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.";
    if (err instanceof Anthropic.APIConnectionError) return "📶 No hay conexión con la API. Comprueba tu Internet.";
    if (err instanceof Anthropic.BadRequestError) {
      const m = String(err.message || "");
      if (/credit balance/i.test(m)) return "💳 Tu cuenta de la API no tiene saldo. Añade crédito en console.anthropic.com (Billing).";
      return "⚠️ La API ha rechazado la petición: " + m;
    }
    if (err instanceof Anthropic.InternalServerError) return "🛠️ El servicio está saturado o con problemas. Inténtalo de nuevo en un momento.";
    if (err instanceof Anthropic.APIUserAbortError) return null;
    return "⚠️ Error inesperado: " + (err && err.message ? err.message : String(err));
  }

  function textOf(content) {
    if (typeof content === "string") return content;
    return (content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  // ---------- Render ----------
  function msgHTML(m) {
    if (m.role === "user") return `<div class="msg user">${esc(textOf(m.content))}</div>`;
    return `<div class="msg bot">${md(textOf(m.content)) || '<span class="muted">(sin texto)</span>'}</div>`;
  }

  function enhanceCode(container) {
    container.querySelectorAll(".msg.bot pre").forEach((pre) => {
      if (pre.dataset.enh) return;
      pre.dataset.enh = "1";
      const wrap = document.createElement("div");
      wrap.className = "cmd";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const b = document.createElement("button");
      b.className = "ghost copy";
      b.textContent = "📋";
      b.title = "Copiar";
      b.setAttribute("data-copy", pre.innerText);
      wrap.appendChild(b);
    });
  }

  function setupHTML() {
    const s = settings();
    return `
      <div class="card stack" style="max-width:720px">
        <h2>🔑 Conecta el Tutor IA</h2>
        <p>El tutor IA usa <b>Claude</b> con las instrucciones de tu tutor SMR. Necesitas una <b>clave de API de Anthropic</b> (se paga por uso; una sesión normal cuesta céntimos).</p>
        <ol class="steps">
          <li>Entra en <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> y crea una cuenta.</li>
          <li>En <b>Billing</b>, añade algo de saldo (por ejemplo 5 €).</li>
          <li>En <b>API Keys</b> pulsa <b>Create Key</b> y copia la clave (empieza por <code>sk-ant-</code>).</li>
          <li>Pégala aquí abajo. Solo se guarda <b>en este navegador</b>.</li>
        </ol>
        ${settingsFormHTML(s)}
        <div class="alert warn small">🔒 No compartas tu clave ni la subas a GitHub. Si la pierdes o se filtra, bórrala en la consola y crea otra.</div>
        <p class="muted small">Sin clave puedes usar todo lo demás: Subnetting, Tests, Laboratorios, Chuletas, Plan de examen y Progreso.</p>
      </div>`;
  }

  function settingsFormHTML(s) {
    return `
      <label class="field"><span>Clave de API</span><input id="apiKey" type="password" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off"></label>
      <label class="field"><span>Modelo</span><select id="model">${Object.entries(MODELS).map(([id, m]) => `<option value="${id}" ${s.model === id ? "selected" : ""}>${m.name} — ${m.desc}</option>`).join("")}</select></label>
      <label class="field"><span>Tipo de respuestas</span><select id="effort">${Object.entries(EFFORTS).map(([id, n]) => `<option value="${id}" ${(s.effort || "medium") === id ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="row"><button id="saveKey">💾 Guardar</button>${s.apiKey ? '<button class="ghost" id="delKey">🗑️ Borrar clave</button>' : ""}</div>`;
  }

  function bindSettings(scope, after) {
    scope.querySelector("#saveKey").onclick = () => {
      const k = scope.querySelector("#apiKey").value.trim();
      if (!k) { toast("Pega tu clave primero"); return; }
      Object.assign(settings(), { apiKey: k, model: scope.querySelector("#model").value, effort: scope.querySelector("#effort").value });
      SMR.store.save();
      toast("✅ Ajustes guardados");
      after && after();
    };
    const del = scope.querySelector("#delKey");
    if (del) del.onclick = () => { settings().apiKey = ""; SMR.store.save(); toast("Clave borrada"); after && after(); };
  }

  function emptyHTML() {
    const pend = SMR.store.pendingList().length;
    return `<div class="empty" id="emptyChat">
      <span class="big-emoji">🤖</span>
      <h2 style="color:var(--text)">¡Hola! Soy tu tutor de SMR</h2>
      <p>Sesiones cortas, ejercicios de uno en uno y sin darte la solución a la primera. ${pend ? `Tienes <b>${pend}</b> fallos pendientes: empezaremos por ahí.` : ""}</p>
      <div class="grid cols-2" style="text-align:left;margin-top:18px">
        ${SUGGESTIONS.map(([i, t], idx) => `<button class="tile" data-sug="${idx}"><span class="tile-icon">${i}</span><span class="tile-desc" style="color:var(--text);font-weight:600">${esc(t.split("\n")[0])}</span></button>`).join("")}
      </div></div>`;
  }

  function render(root) {
    const s = settings();
    if (!s.apiKey) {
      root.innerHTML = `<div class="page-head"><h1>🤖 Tutor IA</h1><p>Explicaciones, correcciones, tests sobre tus apuntes y laboratorios a medida.</p></div>${setupHTML()}`;
      bindSettings(root, () => render(root));
      return;
    }
    const msgs = chat().messages;
    root.innerHTML = `
      <div class="chat">
        <div class="row between" style="margin-bottom:10px">
          <div><h1 style="margin:0">🤖 Tutor IA</h1><span class="muted small">${esc((MODELS[s.model] || { name: s.model }).name)} · ${EFFORTS[s.effort || "medium"]}</span></div>
          <div class="row">
            <button class="ok small" id="endSession" ${msgs.length < 2 ? "disabled" : ""} title="Guarda la nota y los fallos en tu progreso">🏁 Terminar sesión</button>
            <button class="ghost small" id="newChat" title="Nueva conversación">🆕</button>
            <button class="ghost small" id="openSettings" title="Ajustes">⚙️</button>
          </div>
        </div>
        <div class="mode-bar">${MODES.map((m, i) => `<button class="chip" data-mode="${i}">${m.icon} ${m.label}</button>`).join("")}</div>
        <div class="chat-log" id="log">${msgs.length ? msgs.map(msgHTML).join("") : emptyHTML()}</div>
        <div class="composer">
          <textarea id="input" rows="2" placeholder="Escribe aquí… (Enter envía, Mayús+Enter salto de línea)"></textarea>
          <button id="send" class="big" title="Enviar">➤</button>
        </div>
      </div>`;
    const log = root.querySelector("#log");
    const input = root.querySelector("#input");
    enhanceCode(log);
    log.scrollTop = log.scrollHeight;

    root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
      const m = MODES[Number(b.dataset.mode)];
      if (m.send) { send(root, m.send); return; }
      input.value = m.fill;
      input.focus();
      const pos = m.caret ? input.value.length + m.caret : input.value.length;
      input.setSelectionRange(pos, pos);
    }));
    root.querySelectorAll("[data-sug]").forEach((b) => (b.onclick = () => send(root, SUGGESTIONS[Number(b.dataset.sug)][1])));
    root.querySelector("#send").onclick = () => {
      if (streaming) { streaming.abort(); return; }
      send(root, input.value);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); root.querySelector("#send").click(); }
    };
    input.oninput = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; };
    root.querySelector("#newChat").onclick = async () => {
      if (msgs.length && !(await SMR.ui.confirmBox("¿Empezar una conversación nueva? La actual se borrará (pulsa antes «Terminar sesión» si quieres guardar tu nota).", "Nueva conversación"))) return;
      chat().messages = [];
      SMR.store.save();
      render(root);
    };
    root.querySelector("#openSettings").onclick = () => {
      SMR.ui.modal(`<h2>⚙️ Ajustes del Tutor IA</h2><div class="stack">${settingsFormHTML(s)}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="ghost" data-close>Cerrar</button></div>`,
        (m, close) => bindSettings(m, () => { close(); render(root); }));
    };
    root.querySelector("#endSession").onclick = () => endSession(root);
    if (window.matchMedia("(min-width: 861px)").matches) input.focus();
  }

  async function send(root, text) {
    text = (text || "").trim();
    if (!text || streaming) return;
    const msgs = chat().messages;
    msgs.push({ role: "user", content: text });
    SMR.store.save();
    SMR.store.markActive();

    const log = root.querySelector("#log");
    const empty = root.querySelector("#emptyChat");
    if (empty) empty.remove();
    log.insertAdjacentHTML("beforeend", msgHTML(msgs[msgs.length - 1]));
    const input = root.querySelector("#input");
    input.value = "";
    input.style.height = "auto";
    const bubble = document.createElement("div");
    bubble.className = "msg bot";
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;

    const sendBtn = root.querySelector("#send");
    sendBtn.textContent = "■";
    sendBtn.title = "Parar";
    sendBtn.classList.add("danger");
    root.querySelector("#endSession").disabled = true;

    let acc = "";
    let raf = 0;
    const paint = () => {
      raf = 0;
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
      bubble.innerHTML = md(acc);
      if (nearBottom) log.scrollTop = log.scrollHeight;
    };

    try {
      streaming = client().beta.messages.stream(baseParams(msgs));
      streaming.on("text", (delta) => {
        acc += delta;
        if (!raf) raf = requestAnimationFrame(paint);
      });
      const final = await streaming.finalMessage();
      if (raf) cancelAnimationFrame(raf);
      if (final.stop_reason === "refusal") {
        msgs.pop();
        bubble.className = "msg err";
        bubble.innerHTML = "🙈 El modelo no ha podido responder a eso. Prueba a reformular la pregunta.";
        input.value = text;
      } else {
        // Guardamos el contenido completo tal cual (incluidos bloques de razonamiento) para la siguiente petición.
        msgs.push({ role: "assistant", content: final.content });
        bubble.innerHTML = md(textOf(final.content)) || '<span class="muted">(sin texto)</span>';
        if (final.stop_reason === "max_tokens") bubble.insertAdjacentHTML("beforeend", '<p class="muted small">✂️ Respuesta cortada por longitud. Escribe «sigue».</p>');
      }
    } catch (err) {
      if (raf) cancelAnimationFrame(raf);
      const msg = errorText(err);
      if (msg === null && acc) {
        // El alumno ha parado la respuesta: guardamos lo que llegó
        msgs.push({ role: "assistant", content: [{ type: "text", text: acc + "\n\n_(respuesta interrumpida)_" }] });
        bubble.innerHTML = md(acc) + '<p class="muted small">⏹️ Respuesta interrumpida.</p>';
      } else {
        msgs.pop();
        bubble.className = "msg err";
        bubble.innerHTML = esc(msg || "⏹️ Cancelado.");
        input.value = text;
      }
    } finally {
      streaming = null;
      SMR.store.save();
      sendBtn.textContent = "➤";
      sendBtn.title = "Enviar";
      sendBtn.classList.remove("danger");
      root.querySelector("#endSession").disabled = msgs.length < 2;
      enhanceCode(log);
      log.scrollTop = log.scrollHeight;
    }
  }

  async function endSession(root) {
    const msgs = chat().messages;
    if (msgs.length < 2) return;
    const btn = root.querySelector("#endSession");
    btn.disabled = true;
    btn.textContent = "⏳ Guardando…";
    const schema = {
      type: "object",
      properties: {
        tema: { type: "string", enum: Object.keys(SMR.TOPICS), description: "Tema principal trabajado" },
        titulo: { type: "string", description: "Resumen de la sesión en menos de 8 palabras" },
        nota: { type: "number", description: "Nota aproximada de 0 a 10 según sus respuestas. -1 si no hubo ejercicios ni preguntas." },
        fallos: { type: "array", items: { type: "string" }, description: "Errores concretos del alumno, muy cortos (máx. 8 palabras cada uno). Vacío si no falló." },
        consejo: { type: "string", description: "Un consejo corto y motivador para la próxima sesión, en español." },
      },
      required: ["tema", "titulo", "nota", "fallos", "consejo"],
      additionalProperties: false,
    };
    try {
      const params = baseParams([...msgs, { role: "user", content: "Fin de la sesión. Resume la sesión para guardarla en mi progreso: tema, título, nota aproximada, fallos concretos que he tenido y un consejo." }]);
      params.max_tokens = 16000;
      params.output_config = { effort: "low", format: { type: "json_schema", schema } };
      const res = await client().beta.messages.create(params);
      if (res.stop_reason === "refusal") throw new Error("El modelo no pudo generar el resumen.");
      const data = JSON.parse(textOf(res.content));
      const nota = typeof data.nota === "number" && data.nota >= 0 ? Math.min(10, Math.round(data.nota * 10) / 10) : null;
      SMR.store.addSession({
        topic: data.tema, title: "Tutor IA: " + data.titulo, score: nota, source: "tutor",
        fallos: (data.fallos || []).map((f) => ({ topic: data.tema, key: "ia:" + SMR.ui.norm(f), text: f })),
      });
      SMR.ui.modal(`
        <h2>🏁 Sesión guardada</h2>
        <p><span class="badge">${SMR.TOPICS[data.tema].icon} ${SMR.TOPICS[data.tema].name}</span> <b>${esc(data.titulo)}</b></p>
        ${nota !== null ? `<div class="ring" style="--p:${nota * 10};--c:${nota >= 7 ? "var(--ok)" : nota >= 5 ? "var(--warn)" : "var(--bad)"};margin:14px auto"><div><div><b>${nota.toLocaleString("es-ES")}</b><span class="muted">/10</span></div></div></div>` : ""}
        ${data.fallos.length ? `<h3>Fallos para repasar</h3><ul>${data.fallos.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p>✅ Sin fallos destacados.</p>`}
        <div class="alert info">💬 ${esc(data.consejo)}</div>
        <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="ghost" data-close>Seguir con esta conversación</button><button id="fresh">🆕 Empezar otra</button></div>`,
        (m, close) => { m.querySelector("#fresh").onclick = () => { chat().messages = []; SMR.store.save(); close(); render(root); }; });
    } catch (err) {
      toast(errorText(err) || "No se pudo guardar la sesión", 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = "🏁 Terminar sesión";
    }
  }

  SMR.ai = {
    MODELS,
    view(root, opts = {}) {
      render(root);
      if (!settings().apiKey) return;
      if (opts.prompt) send(root, opts.prompt);
      else if (opts.fill) {
        const input = root.querySelector("#input");
        input.value = opts.fill;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    },
  };
})();
