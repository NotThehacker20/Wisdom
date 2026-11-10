/* Subnetting: lógica IPv4, generador de ejercicios por niveles y vista visual */
(function () {
  const { esc } = SMR.ui;

  // ---------- Lógica IPv4 ----------
  const ip = {
    toInt(s) {
      const m = String(s || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (!m) return null;
      const o = m.slice(1).map(Number);
      if (o.some((x) => x > 255)) return null;
      return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
    },
    toStr(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); },
    mask(p) { return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; },
    net(n, p) { return (n & ip.mask(p)) >>> 0; },
    bc(n, p) { return (ip.net(n, p) | (~ip.mask(p) >>> 0)) >>> 0; },
    size(p) { return 2 ** (32 - p); },
    hosts(p) { return p >= 31 ? 0 : 2 ** (32 - p) - 2; },
    /** Acepta "/26", "26" o "255.255.255.192". Devuelve el prefijo o null. */
    parsePrefix(s) {
      s = String(s || "").trim().replace(/^\//, "");
      if (/^\d{1,2}$/.test(s)) { const p = Number(s); return p <= 32 ? p : null; }
      const n = ip.toInt(s);
      if (n === null) return null;
      const bin = n.toString(2).padStart(32, "0");
      if (!/^1*0*$/.test(bin)) return null; // máscara no contigua
      return bin.indexOf("0") === -1 ? 32 : bin.indexOf("0");
    },
    bin(n) { return n.toString(2).padStart(32, "0"); },
  };

  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function randomPrivate(p) {
    // Dirección privada aleatoria compatible con el prefijo
    if (p >= 16 && Math.random() < 0.45) return ip.toInt(`192.168.${rand(0, 255)}.${rand(0, 255)}`);
    if (p >= 12 && Math.random() < 0.5) return ip.toInt(`172.${rand(16, 31)}.${rand(0, 255)}.${rand(0, 255)}`);
    return ip.toInt(`10.${rand(0, 255)}.${rand(0, 255)}.${rand(0, 255)}`);
  }

  function hostInside(n, p) {
    const net = ip.net(n, p), bc = ip.bc(n, p);
    if (n === net) n += 1 + rand(0, Math.min(5, bc - net - 2));
    if (n === bc) n -= 1;
    return n >>> 0;
  }

  // ---------- Generadores ----------
  const LEVELS = [
    { n: 1, name: "Básico", desc: "Máscaras /8, /16 y /24" },
    { n: 2, name: "Intermedio", desc: "Cualquier máscara" },
    { n: 3, name: "Dividir en subredes", desc: "Bits prestados y bloques" },
    { n: 4, name: "VLSM", desc: "Subredes de distinto tamaño" },
  ];

  function genBasic() {
    const p = pick([8, 16, 24, 24]);
    const base = p === 24 ? ip.toInt(`192.168.${rand(0, 255)}.${rand(1, 254)}`)
      : p === 16 ? ip.toInt(`172.${rand(16, 31)}.${rand(0, 255)}.${rand(1, 254)}`)
      : ip.toInt(`10.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`);
    return { level: 1, ip: hostInside(base, p), p };
  }
  function genInter() {
    const p = Math.random() < 0.2 ? rand(9, 15) : rand(17, 30);
    return { level: 2, ip: hostInside(randomPrivate(p), p), p };
  }
  function genSplit() {
    const p = pick([24, 24, 24, 16]);
    const base = p === 24 ? ip.toInt(`192.168.${rand(0, 255)}.0`) : ip.toInt(`172.${rand(16, 31)}.0.0`);
    let N, bits;
    do { N = pick([2, 3, 4, 5, 6, 8, 10, 12, 16]); bits = Math.ceil(Math.log2(N)); } while (p + bits > 30);
    const np = p + bits;
    const k = rand(2, Math.max(2, N));
    const subNet = (base + (k - 1) * ip.size(np)) >>> 0;
    return { level: 3, base, p, N, bits, np, k, subNet, subBc: (subNet + ip.size(np) - 1) >>> 0 };
  }
  function genVLSM() {
    const names = ["Ventas", "Informática", "Dirección", "Almacén", "Taller", "Aulas", "Wifi invitados", "Recepción"];
    const p = Math.random() < 0.75 ? 24 : 23;
    const base = p === 24 ? ip.toInt(`192.168.${rand(0, 255)}.0`) : ip.toInt(`172.${rand(16, 31)}.${rand(0, 127) * 2}.0`);
    const total = ip.size(p);
    for (let tries = 0; tries < 500; tries++) {
      const count = rand(3, 4);
      const chosen = SMR.ui.shuffle(names).slice(0, count);
      const depts = chosen.map((name) => ({ name, hosts: rand(3, p === 24 ? 110 : 220) }));
      if (Math.random() < 0.5) depts.push({ name: "Enlace entre routers", hosts: 2 });
      depts.forEach((d) => { d.np = 32 - Math.ceil(Math.log2(d.hosts + 2)); d.size = ip.size(d.np); });
      const sum = depts.reduce((a, d) => a + d.size, 0);
      if (sum > total || sum < total * 0.45) continue;
      // Solución de referencia: de mayor a menor
      const sorted = depts.slice().sort((a, b) => b.size - a.size);
      let cur = base;
      sorted.forEach((d) => { d.net = cur; d.bc = (cur + d.size - 1) >>> 0; cur = (cur + d.size) >>> 0; });
      return { level: 4, base, p, depts: SMR.ui.shuffle(depts), order: sorted };
    }
    return genVLSM();
  }
  const GEN = { 1: genBasic, 2: genInter, 3: genSplit, 4: genVLSM };

  // ---------- Visualización binaria ----------
  function bitsHTML(n, p, borrowFrom) {
    const b = ip.bin(n);
    let out = "";
    for (let i = 0; i < 32; i++) {
      const cls = borrowFrom !== undefined && i >= borrowFrom && i < p ? "bit-s" : i < p ? "bit-n" : "bit-h";
      out += `<span class="${cls}">${b[i]}</span>`;
      if (i % 8 === 7 && i < 31) out += '<span class="muted">.</span>';
    }
    return out;
  }
  function binTable(rows, p, borrowFrom) {
    return `<div class="binary"><table>${rows.map((r) => `<tr><td class="lbl">${esc(r.label)}</td><td>${bitsHTML(r.n, p, borrowFrom)}</td><td class="lbl" style="padding-left:14px">${ip.toStr(r.n)}</td></tr>`).join("")}</table></div>
      <div class="legend" style="margin-top:8px"><span><i style="background:var(--net)"></i>bits de red</span>${borrowFrom !== undefined ? '<span><i style="background:var(--ok)"></i>bits prestados (subred)</span>' : ""}<span><i style="background:var(--host)"></i>bits de host</span></div>`;
  }

  function blockInfo(n, p) {
    if (p % 8 === 0) return null;
    const idx = Math.floor(p / 8);
    const maskOct = (ip.mask(p) >>> (24 - idx * 8)) & 255;
    const B = 256 - maskOct;
    const val = (n >>> (24 - idx * 8)) & 255;
    const start = Math.floor(val / B) * B;
    return { idx, maskOct, B, val, start };
  }

  // ---------- Explicaciones ----------
  function solveBasic(ex) {
    const { p } = ex, n = ex.ip;
    const net = ip.net(n, p), bc = ip.bc(n, p), m = ip.mask(p);
    const bi = blockInfo(n, p);
    const steps = [
      `<b>Máscara:</b> /${p} = ${p} unos seguidos de ${32 - p} ceros → <code>${ip.toStr(m)}</code>`,
      `<b>Pasa a binario y separa red y host:</b>${binTable([{ label: "IP", n }, { label: "Máscara", n: m }, { label: "Red (AND)", n: net }, { label: "Broadcast", n: bc }], p)}`,
    ];
    if (bi) {
      const starts = [];
      for (let s = 0; s < 256 && starts.length < 6; s += bi.B) starts.push(s);
      steps.push(`<b>Truco del bloque:</b> el octeto interesante es el <b>${bi.idx + 1}º</b> (máscara ${bi.maskOct}). Tamaño de bloque = 256 − ${bi.maskOct} = <b>${bi.B}</b>. Las redes empiezan en ${starts.join(", ")}… El valor <b>${bi.val}</b> cae en el bloque que empieza en <b>${bi.start}</b> y termina en <b>${bi.start + bi.B - 1}</b>.`);
    } else {
      steps.push(`<b>La máscara acaba justo en un octeto:</b> copia los octetos de red y pon los de host a <code>0</code> (red) o a <code>255</code> (broadcast).`);
    }
    steps.push(`<b>Red</b> = bits de host a 0 → <code>${ip.toStr(net)}</code>. <b>Broadcast</b> = bits de host a 1 → <code>${ip.toStr(bc)}</code>.`);
    steps.push(`<b>Rango de hosts:</b> red + 1 = <code>${ip.toStr(net + 1)}</code> hasta broadcast − 1 = <code>${ip.toStr(bc - 1)}</code>.`);
    steps.push(`<b>Nº de hosts:</b> 2<sup>${32 - p}</sup> − 2 = ${ip.size(p)} − 2 = <b>${ip.hosts(p)}</b> (se restan la red y el broadcast).`);
    return steps;
  }
  function solveSplit(ex) {
    const s = [];
    s.push(`<b>¿Cuántos bits pido prestados?</b> Busca la potencia de 2 que llegue a ${ex.N}: 2<sup>${ex.bits}</sup> = ${2 ** ex.bits} ≥ ${ex.N} → <b>${ex.bits} bits</b>.${2 ** ex.bits > ex.N ? ` (Sobrarán ${2 ** ex.bits - ex.N} subredes.)` : ""}`);
    s.push(`<b>Nuevo prefijo:</b> /${ex.p} + ${ex.bits} = <b>/${ex.np}</b> → máscara <code>${ip.toStr(ip.mask(ex.np))}</code>`);
    s.push(`<b>Hosts por subred:</b> 2<sup>${32 - ex.np}</sup> − 2 = <b>${ip.hosts(ex.np)}</b>`);
    s.push(`<b>Tamaño de cada subred:</b> 2<sup>${32 - ex.np}</sup> = ${ip.size(ex.np)} direcciones. Las subredes van de ${ip.size(ex.np)} en ${ip.size(ex.np)}:` +
      `<div class="table-wrap"><table class="data" style="margin-top:8px"><tr><th>Nº</th><th>Red</th><th>Broadcast</th></tr>${Array.from({ length: Math.min(2 ** ex.bits, 8) }, (_, i) => {
        const net = (ex.base + i * ip.size(ex.np)) >>> 0;
        const hl = i + 1 === ex.k ? ' style="background:var(--primary-soft);font-weight:800"' : "";
        return `<tr${hl}><td>${i + 1}</td><td class="mono">${ip.toStr(net)}/${ex.np}</td><td class="mono">${ip.toStr(net + ip.size(ex.np) - 1)}</td></tr>`;
      }).join("")}${2 ** ex.bits > 8 ? `<tr><td colspan="3" class="muted">… hasta ${2 ** ex.bits} subredes</td></tr>` : ""}</table></div>`);
    s.push(`<b>En binario</b> (subred nº ${ex.k}):${binTable([{ label: `Subred ${ex.k}`, n: ex.subNet }, { label: "Máscara", n: ip.mask(ex.np) }], ex.np, ex.p)}`);
    return s;
  }
  function solveVLSM(ex) {
    const s = [];
    s.push(`<b>Ordena de mayor a menor</b> nº de hosts: ${ex.order.map((d) => `${esc(d.name)} (${d.hosts})`).join(" → ")}.`);
    s.push(`<b>Para cada uno</b>, suma 2 (red + broadcast) y sube a la siguiente potencia de 2:<ul>${ex.order.map((d) => `<li>${esc(d.name)}: ${d.hosts} + 2 = ${d.hosts + 2} → ${d.size} direcciones → <b>/${d.np}</b> (${ip.hosts(d.np)} hosts útiles)</li>`).join("")}</ul>`);
    s.push(`<b>Reparte en orden</b> desde ${ip.toStr(ex.base)}: cada subred empieza justo donde acaba la anterior.` +
      `<div class="table-wrap"><table class="data" style="margin-top:8px"><tr><th>Departamento</th><th>Red</th><th>Primer host</th><th>Último host</th><th>Broadcast</th></tr>${ex.order.map((d) => `<tr><td>${esc(d.name)}</td><td class="mono">${ip.toStr(d.net)}/${d.np}</td><td class="mono">${ip.toStr(d.net + 1)}</td><td class="mono">${ip.toStr(d.bc - 1)}</td><td class="mono">${ip.toStr(d.bc)}</td></tr>`).join("")}</table></div>`);
    const used = ex.order.reduce((a, d) => a + d.size, 0);
    s.push(`<b>Comprobación:</b> usas ${used} de ${ip.size(ex.p)} direcciones; quedan ${ip.size(ex.p) - used} libres desde <code>${ip.toStr(ex.base + used)}</code>.`);
    return s;
  }

  function hintsFor(ex) {
    if (ex.level <= 2) {
      const bi = blockInfo(ex.ip, ex.p);
      return [
        "Pasa la máscara a binario: los bits a 1 son la parte de RED y los bits a 0 son de HOST. La dirección de red pone los bits de host a 0; el broadcast, a 1.",
        bi ? `Fíjate en el octeto ${bi.idx + 1}º: la máscara vale ${bi.maskOct} ahí. Calcula 256 − ${bi.maskOct} para saber de cuánto en cuánto van las redes.`
           : `La máscara /${ex.p} termina justo en un octeto: los octetos de host serán 0 en la red y 255 en el broadcast.`,
      ];
    }
    if (ex.level === 3) {
      return [
        `¿Qué potencia de 2 es la primera que llega a ${ex.N}? Ese exponente son los bits que tomas prestados.`,
        `Nuevo prefijo = /${ex.p} + bits prestados. Cada subred mide 2^(32 − nuevo prefijo) direcciones: súmalo ${ex.k - 1} veces a la red base para llegar a la subred nº ${ex.k}.`,
      ];
    }
    return [
      "Ordena los departamentos de MAYOR a MENOR número de hosts y empieza siempre por el más grande.",
      "Para cada uno: hosts + 2 → sube a la siguiente potencia de 2 → ese es el tamaño del bloque. Cada red empieza donde termina la anterior.",
    ];
  }

  // ---------- Vista ----------
  let ex = null;
  let firstCheckDone = false;
  let hintLevel = 0;
  let mode = "practica";
  let levelTimer = 0;
  const runState = { ok: 0, bad: 0 };

  function fieldsFor(e) {
    if (e.level <= 2) {
      return [
        { k: "mask", label: "Máscara (decimal)", ph: "x.x.x.x", expect: ip.toStr(ip.mask(e.p)), type: "mask", val: e.p },
        { k: "net", label: "Dirección de red", ph: "x.x.x.x", expect: ip.toStr(ip.net(e.ip, e.p)), type: "ip" },
        { k: "bc", label: "Broadcast", ph: "x.x.x.x", expect: ip.toStr(ip.bc(e.ip, e.p)), type: "ip" },
        { k: "first", label: "Primer host", ph: "x.x.x.x", expect: ip.toStr(ip.net(e.ip, e.p) + 1), type: "ip" },
        { k: "last", label: "Último host", ph: "x.x.x.x", expect: ip.toStr(ip.bc(e.ip, e.p) - 1), type: "ip" },
        { k: "hosts", label: "Nº de hosts útiles", ph: "0", expect: String(ip.hosts(e.p)), type: "num" },
      ];
    }
    if (e.level === 3) {
      return [
        { k: "bits", label: "Bits prestados", ph: "0", expect: String(e.bits), type: "num" },
        { k: "np", label: "Nuevo prefijo o máscara", ph: "/xx", expect: "/" + e.np, type: "mask", val: e.np },
        { k: "hosts", label: "Hosts por subred", ph: "0", expect: String(ip.hosts(e.np)), type: "num" },
        { k: "subnet", label: `Red de la subred nº ${e.k}`, ph: "x.x.x.x", expect: ip.toStr(e.subNet), type: "ip" },
        { k: "subbc", label: `Broadcast de la subred nº ${e.k}`, ph: "x.x.x.x", expect: ip.toStr(e.subBc), type: "ip" },
      ];
    }
    return null;
  }

  const LABELS = { mask: "Máscara", net: "Dirección de red", bc: "Broadcast", first: "Primer host", last: "Último host", hosts: "Nº de hosts", bits: "Bits prestados", np: "Nuevo prefijo", subnet: "Red de la subred n", subbc: "Broadcast de la subred n" };

  function problemHTML(e) {
    if (e.level <= 2) return `<div class="problem">Calcula para <span class="mono">${ip.toStr(e.ip)}/${e.p}</span></div>`;
    if (e.level === 3) return `<div class="problem">Divide <span class="mono">${ip.toStr(e.base)}/${e.p}</span> en <b>${e.N}</b> subredes</div>
      <p class="muted small" style="margin-top:8px">Usa subredes del mismo tamaño. La subred nº 1 es la primera (la que empieza en ${ip.toStr(e.base)}).</p>`;
    return `<div class="problem">VLSM sobre <span class="mono">${ip.toStr(e.base)}/${e.p}</span></div>
      <p class="muted small" style="margin-top:8px">Asigna a cada departamento la subred más pequeña posible, sin solaparse.</p>`;
  }

  function answersHTML(e) {
    const f = fieldsFor(e);
    if (f) {
      return `<div class="answers">${f.map((x) => `<label class="field"><span>${esc(x.label)}</span>
        <input data-k="${x.k}" placeholder="${esc(x.ph)}" autocomplete="off" spellcheck="false" inputmode="${x.type === "num" ? "numeric" : "decimal"}"><div class="fb" data-fb="${x.k}"></div></label>`).join("")}</div>`;
    }
    return `<div class="table-wrap"><table class="data"><tr><th>Departamento</th><th>Hosts</th><th>Dirección de red</th><th>Prefijo</th><th>Broadcast</th></tr>
      ${e.depts.map((d, i) => `<tr data-row="${i}"><td><b>${esc(d.name)}</b></td><td>${d.hosts}</td>
        <td><input data-v="net" data-i="${i}" placeholder="x.x.x.x" autocomplete="off"></td>
        <td><input data-v="p" data-i="${i}" placeholder="/xx" autocomplete="off" style="min-width:80px"></td>
        <td><input data-v="bc" data-i="${i}" placeholder="x.x.x.x" autocomplete="off"><div class="fb" data-fbrow="${i}"></div></td></tr>`).join("")}</table></div>`;
  }

  function checkSimple(root) {
    const wrong = [];
    fieldsFor(ex).forEach((x) => {
      const inp = root.querySelector(`[data-k="${x.k}"]`);
      const fb = root.querySelector(`[data-fb="${x.k}"]`);
      const v = inp.value.trim();
      let ok;
      if (x.type === "ip") ok = ip.toInt(v) !== null && ip.toInt(v) === ip.toInt(x.expect);
      else if (x.type === "num") ok = v.replace(/\./g, "") === x.expect;
      else ok = ip.parsePrefix(v) === x.val;
      inp.classList.toggle("ok", ok);
      inp.classList.toggle("bad", !ok);
      fb.className = "fb " + (ok ? "ok" : "bad");
      fb.textContent = ok ? "✔ Correcto" : v ? "✘ Revísalo" : "✘ Falta";
      if (!ok) wrong.push(LABELS[x.k]);
    });
    return wrong;
  }

  function checkVLSM(root) {
    const wrong = [];
    const ranges = [];
    const baseEnd = ex.base + ip.size(ex.p) - 1;
    ex.depts.forEach((d, i) => {
      const get = (v) => root.querySelector(`[data-v="${v}"][data-i="${i}"]`);
      const nI = get("net"), pI = get("p"), bI = get("bc");
      const n = ip.toInt(nI.value), pp = ip.parsePrefix(pI.value), b = ip.toInt(bI.value);
      const pOk = pp === d.np;
      const nOk = n !== null && pp !== null && n >= ex.base && n <= baseEnd && ip.net(n, pp) === n;
      const bOk = nOk && pOk && b === n + ip.size(pp) - 1 && b <= baseEnd;
      [[nI, nOk], [pI, pOk], [bI, bOk]].forEach(([el, ok]) => { el.classList.toggle("ok", ok); el.classList.toggle("bad", !ok); });
      const fb = root.querySelector(`[data-fbrow="${i}"]`);
      let msg = "";
      if (!pOk) msg = `Prefijo: necesitas ${d.hosts} + 2 direcciones`;
      else if (!nOk) msg = "La red no empieza en un múltiplo del bloque o se sale del rango";
      else if (!bOk) msg = "Broadcast = red + tamaño − 1";
      if (nOk && pOk) ranges.push({ i, a: n, b: n + ip.size(pp) - 1 });
      fb.className = "fb " + (msg ? "bad" : "ok");
      fb.textContent = msg ? "✘ " + msg : "✔ Correcto";
      if (msg) wrong.push("VLSM: " + (!pOk ? "elegir prefijo" : !nOk ? "dirección de red" : "broadcast"));
    });
    // Solapes
    ranges.sort((x, y) => x.a - y.a);
    for (let j = 1; j < ranges.length; j++) {
      if (ranges[j].a <= ranges[j - 1].b) {
        const fb = root.querySelector(`[data-fbrow="${ranges[j].i}"]`);
        fb.className = "fb bad";
        fb.textContent = "✘ Se solapa con otra subred";
        wrong.push("VLSM: subredes solapadas");
      }
    }
    return [...new Set(wrong)];
  }

  function adapt(correct) {
    const s = SMR.store.state.subnet;
    if (correct) { runState.ok++; runState.bad = 0; } else { runState.bad++; runState.ok = 0; }
    if (runState.ok >= 3 && s.level < 4) {
      s.level++; runState.ok = 0; SMR.store.save();
      SMR.ui.toast(`🚀 ¡3 seguidas! Subimos a nivel ${s.level}: ${LEVELS[s.level - 1].name}`, 4000);
      return true;
    }
    if (runState.bad >= 2 && s.level > 1) {
      s.level--; runState.bad = 0; SMR.store.save();
      SMR.ui.toast(`🔁 Volvemos un paso atrás (nivel ${s.level}) para afianzar. ¡Sin agobios!`, 4000);
      return true;
    }
    return false;
  }

  function calcHTML() {
    return `<div class="card stack">
      <h3>🔍 Calculadora visual</h3>
      <p class="muted">Escribe una IP y un prefijo para ver en binario qué parte es de red y cuál de host. Úsala para comprobar, no para copiar 😉</p>
      <div class="row"><input id="cIp" class="grow mono" placeholder="192.168.1.77" style="max-width:260px" value="192.168.1.77">
      <input id="cP" class="mono" placeholder="/26" style="max-width:110px" value="/26"></div>
      <div id="cOut"></div></div>`;
  }
  function calcUpdate(root) {
    const n = ip.toInt(root.querySelector("#cIp").value);
    const p = ip.parsePrefix(root.querySelector("#cP").value);
    const out = root.querySelector("#cOut");
    if (n === null || p === null || p > 32) { out.innerHTML = `<p class="muted">Escribe una IP válida (ej. 10.0.5.20) y un prefijo (ej. /20 o 255.255.240.0).</p>`; return; }
    const net = ip.net(n, p), bc = ip.bc(n, p);
    out.innerHTML = binTable([{ label: "IP", n }, { label: "Máscara", n: ip.mask(p) }, { label: "Red", n: net }, { label: "Broadcast", n: bc }], p) +
      `<div class="grid cols-4" style="margin-top:14px">
      ${[["Máscara", ip.toStr(ip.mask(p))], ["Red", ip.toStr(net) + "/" + p], ["Broadcast", ip.toStr(bc)],
         ["Rango", p <= 30 ? ip.toStr(net + 1) + " – " + ip.toStr(bc - 1) : "—"], ["Hosts útiles", ip.hosts(p).toLocaleString("es-ES")]]
        .map(([k, v]) => `<div class="card flat"><div class="stat-label">${k}</div><div class="mono" style="font-weight:700">${v}</div></div>`).join("")}</div>`;
  }

  function render(root) {
    const st = SMR.store.state.subnet;
    const hist = st.history.slice(-10);
    root.innerHTML = `
      <div class="page-head"><h1>🧮 Subnetting</h1><p>Ejercicios que suben de nivel solos: 3 aciertos seguidos → subes; 2 fallos seguidos → bajas un paso.</p></div>
      <div class="chips" style="margin-bottom:14px">
        <button class="chip ${mode === "practica" ? "on" : ""}" data-mode="practica">✏️ Practicar</button>
        <button class="chip ${mode === "calc" ? "on" : ""}" data-mode="calc">🔍 Calculadora visual</button>
      </div>
      ${mode === "calc" ? calcHTML() : `
      <div class="levels" style="margin-bottom:16px">${LEVELS.map((l) => `<button class="level ${st.level === l.n ? "on" : ""}" data-level="${l.n}"><b>Nivel ${l.n} · ${l.name}</b><small>${l.desc}</small></button>`).join("")}</div>
      <div class="row between" style="margin-bottom:10px"><div class="row"><span class="muted small">Últimos ejercicios:</span><div class="streak">${Array.from({ length: 10 }, (_, i) => `<i class="${hist[i] === 1 ? "ok" : hist[i] === 0 ? "bad" : ""}"></i>`).join("")}</div></div></div>
      <div class="card stack" id="exCard">
        ${problemHTML(ex)}
        ${answersHTML(ex)}
        <div class="row">
          <button id="btnCheck" class="ok">✅ Comprobar</button>
          <button id="btnHint" class="secondary">💡 Pista</button>
          <button id="btnSol" class="ghost">👀 Ver solución</button>
          <button id="btnNext" class="ghost">➡️ Siguiente</button>
        </div>
        <div id="hintBox"></div>
        <div id="resultBox"></div>
      </div>
      <div id="solBox" style="margin-top:16px"></div>`}`;

    root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; render(root); }));
    if (mode === "calc") {
      root.querySelectorAll("#cIp, #cP").forEach((i) => (i.oninput = () => calcUpdate(root)));
      calcUpdate(root);
      return;
    }
    root.querySelectorAll("[data-level]").forEach((b) => (b.onclick = () => { st.level = Number(b.dataset.level); SMR.store.save(); newExercise(root); }));
    root.querySelector("#btnNext").onclick = () => newExercise(root);
    root.querySelector("#btnHint").onclick = () => {
      const hints = hintsFor(ex);
      if (hintLevel < hints.length) {
        hintLevel++;
        root.querySelector("#hintBox").innerHTML = hints.slice(0, hintLevel).map((h, i) => `<div class="alert info" style="margin-top:8px">💡 <b>Pista ${i + 1}:</b> ${esc(h)}</div>`).join("");
        if (hintLevel === hints.length) root.querySelector("#btnHint").textContent = "📖 Guíame paso a paso";
      } else {
        showSolution(root);
      }
    };
    root.querySelector("#btnSol").onclick = async () => {
      if (!firstCheckDone && !(await SMR.ui.confirmBox("¿Seguro? Intenta primero con una pista 💡", "Ver solución"))) return;
      showSolution(root);
    };
    root.querySelector("#btnCheck").onclick = () => {
      const card = root.querySelector("#exCard");
      const wrong = ex.level === 4 ? checkVLSM(card) : checkSimple(card);
      const correct = wrong.length === 0;
      const rb = root.querySelector("#resultBox");
      if (!firstCheckDone) {
        firstCheckDone = true;
        SMR.store.recordSubnet(correct, wrong);
        const changed = adapt(correct);
        if (changed) levelTimer = setTimeout(() => newExercise(root), 1600);
      }
      rb.innerHTML = correct
        ? `<div class="alert ok">🎉 <b>¡Perfecto!</b> Todo correcto. Pulsa <b>Siguiente</b> para otro.</div>`
        : `<div class="alert bad">Tienes ${wrong.length} ${wrong.length === 1 ? "fallo" : "fallos"}: <b>${esc(wrong.join(", "))}</b>. Corrige los campos en rojo o pide una pista.</div>`;
    };
    root.querySelector("#exCard").addEventListener("keydown", (e) => { if (e.key === "Enter") root.querySelector("#btnCheck").click(); });
  }

  function showSolution(root) {
    if (!firstCheckDone) {
      firstCheckDone = true;
      SMR.store.recordSubnet(false, ["Pidió la solución (nivel " + ex.level + ")"]);
      adapt(false);
    }
    const steps = ex.level <= 2 ? solveBasic(ex) : ex.level === 3 ? solveSplit(ex) : solveVLSM(ex);
    root.querySelector("#solBox").innerHTML = `<div class="card"><h3>📖 Procedimiento paso a paso</h3><ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol></div>`;
    root.querySelector("#solBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function newExercise(root) {
    clearTimeout(levelTimer);
    ex = GEN[SMR.store.state.subnet.level]();
    firstCheckDone = false;
    hintLevel = 0;
    render(root);
    const first = root.querySelector("#exCard input");
    if (first) first.focus({ preventScroll: true });
  }

  SMR.subnet = {
    ip, LEVELS,
    view(root, opts = {}) {
      if (opts.mode) mode = opts.mode;
      if (opts.level) { SMR.store.state.subnet.level = opts.level; SMR.store.save(); }
      if (!ex || opts.level || ex.level !== SMR.store.state.subnet.level) newExercise(root);
      else render(root);
    },
  };
})();
