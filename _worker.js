// ═══════════════════════════════════════════════════════════
// Caravanas Sur — Worker con CMS via GitHub
// ═══════════════════════════════════════════════════════════

const GITHUB_REPO    = "salirenbuscadore/caravanas-sur";
const GITHUB_BRANCH  = "main";
const JSON_FILE      = "caravanas.json";
const ADMIN_PASSWORD = "laurent2026";
const SHEET_ID       = "1yCy5ckZk7hMWQkKfktd5qn0u_goFsNtv0yOSh57py94";
const WEBHOOK        = "https://script.google.com/macros/s/AKfycbybZWITX-1AyY37UUuNyeDQv6onIDjxO7Nx71Lqy7i_Q35rOvPelD-lCxNXZ_y95KPj/exec";

const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

function ghHeaders(env) {
  return { Authorization: `token ${env.GITHUB_TOKEN}`, "User-Agent": "caravanas-sur" };
}

async function getCaravanasPublic() {
  const res = await fetch(`${RAW_BASE}/${JSON_FILE}?t=${Date.now()}`);
  if (!res.ok) return [];
  return res.json();
}

async function getCaravanasAdmin(env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN no configurado");
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`, { headers: ghHeaders(env) });
  const data = await res.json();
  if (!res.ok || !data.content) throw new Error("GitHub: " + (data.message || res.status));
  const decoded = atob(data.content.replace(/\n/g, ''));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, c => c.charCodeAt(0))));
}

async function saveCaravanas(env, caravanas) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN no configurado");
  const shaRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`, { headers: ghHeaders(env) });
  const shaData = await shaRes.json();
  if (!shaRes.ok || !shaData.sha) throw new Error("No SHA: " + (shaData.message || shaRes.status));
  const fileContent = btoa(unescape(encodeURIComponent(JSON.stringify(caravanas, null, 2))));
  const putRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ message: "CMS: actualizar catálogo", content: fileContent, sha: shaData.sha, branch: GITHUB_BRANCH })
  });
  if (!putRes.ok) { const e = await putRes.json().catch(()=>({})); throw new Error("PUT falló: " + (e.message || putRes.status)); }
}

async function syncSheet(caravanas) {
  try { await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "catalogo", caravanas }) }); }
  catch (e) { console.log("Sheet sync error:", e); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

async function fetchPublic(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) return new Response("Not found", { status: 404 });
  const text = await res.text();
  return new Response(text, { headers: { "Content-Type": path.endsWith(".html") ? "text/html;charset=UTF-8" : "application/octet-stream" } });
}

async function getSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1];
  return JSON.parse(jsonStr).table;
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } });
    }

    // ── API pública ────────────────────────────────────────
    if (path === "/api/caravanas" && method === "GET") return json(await getCaravanasPublic());

    // ── API mensajes ───────────────────────────────────────
    if (path === "/api/mensajes" && method === "GET") {
      try {
        const table = await getSheetData("mensajes");
        const rows = (table.rows || []).map((row, i) => ({
          id: i, fila: i + 2,
          fecha:   row.c[0]?.v || "",
          de:      row.c[1]?.v || "",
          asunto:  row.c[2]?.v || "",
          mensaje: row.c[3]?.v || "",
          estado:  row.c[4]?.v || "Nuevo",
          nota:    row.c[5]?.v || "",
          link:    row.c[6]?.v || ""
        }));
        return json(rows);
      } catch(e) { return json({ error: e.message }, 500); }
    }

    // ── API alertas ────────────────────────────────────────
    if (path === "/api/alertas" && method === "GET") {
      try {
        const table = await getSheetData("alertas");
        const rows = (table.rows || []).slice(1).map((row, i) => ({
          id: i, fila: i + 2,
          fecha:     row.c[0]?.v || "",
          titulo:    row.c[1]?.v || "",
          precio:    row.c[2]?.v || "",
          localiz:   row.c[3]?.v || "",
          vendedor:  row.c[4]?.v || "",
          anio:      row.c[5]?.v || "",
          link:      row.c[6]?.v || "",
          contenido: row.c[7]?.v || "",
          visto:     row.c[8]?.v || "No",
          interes:   row.c[9]?.v || "",
          estado:    row.c[10]?.v || "Por ver"
        }));
        return json(rows);
      } catch(e) { return json({ error: e.message }, 500); }
    }

    // ── API estado mensaje ─────────────────────────────────
    if (path === "/api/mensajes/estado" && method === "POST") {
      const body = await request.json();
      try {
        await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "estado_mensaje", fila: body.fila, estado: body.estado }) });
        return json({ ok: true });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── API estado alerta ──────────────────────────────────
    if (path === "/api/alertas/estado" && method === "POST") {
      const body = await request.json();
      try {
        await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "estado_alerta", fila: body.fila, interes: body.interes, estado: body.estado }) });
        return json({ ok: true });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── API admin caravanas ────────────────────────────────
    if (path.startsWith("/api/admin")) {
      const auth = request.headers.get("X-Admin-Password");
      if (auth !== ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401);
      try {
        if (path === "/api/admin/caravanas" && method === "GET") return json(await getCaravanasAdmin(env));
        if (path === "/api/admin/caravanas" && method === "POST") {
          const body = await request.json(); const list = await getCaravanasAdmin(env);
          body.id = Date.now().toString(); list.push(body);
          await saveCaravanas(env, list); await syncSheet(list);
          return json({ ok: true, id: body.id });
        }
        if (path.startsWith("/api/admin/caravanas/") && method === "PUT") {
          const id = path.split("/").pop(); const body = await request.json();
          let list = await getCaravanasAdmin(env);
          list = list.map(c => c.id === id ? { ...body, id } : c);
          await saveCaravanas(env, list); await syncSheet(list);
          return json({ ok: true });
        }
        if (path.startsWith("/api/admin/caravanas/") && method === "DELETE") {
          const id = path.split("/").pop(); let list = await getCaravanasAdmin(env);
          list = list.filter(c => c.id !== id);
          await saveCaravanas(env, list); await syncSheet(list);
          return json({ ok: true });
        }
      } catch (err) { return json({ error: err.message || "Error desconocido" }, 500); }
    }

    // ── Admin HTML ─────────────────────────────────────────
    if (path === "/admin" || path === "/admin/") {
      return new Response(adminHTML(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // ── Páginas públicas ───────────────────────────────────
    if (path === "/" || path === "/index.html") return fetchPublic("index.html");
    if (path === "/vendeurs.html" || path === "/vendeurs") return fetchPublic("vendeurs.html");
    if (path === "/mensajes" || path === "/mensajes.html") return fetchPublic("mensajes.html");
    if (path.startsWith("/fotos/")) return fetchPublic(path.slice(1));

    return new Response("Not found", { status: 404 });
  }
};

function adminHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — Caravanas Sur</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#F5F2EC;color:#1C1A16}

input,select,textarea{width:100%;padding:9px 11px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px}
textarea{min-height:80px;resize:vertical;margin-bottom:0}
.btn{padding:10px 20px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.btn-primary{background:#C85B2A;color:#fff;width:100%}
.btn-primary:hover{opacity:.88}
.btn-sm{padding:6px 12px;font-size:12px}
.btn-edit{background:#2C2C2A;color:#fff}
.btn-danger{background:#dc3545;color:#fff}
.btn-cancel{background:#eee;color:#333}
#app{display:none}
.header{background:#2C2C2A;color:#F1EFE8;padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:16px}
.header a{color:#E8956D;font-size:13px;text-decoration:none}

/* TABS */
.tabs{display:flex;gap:0;background:#1a1a18;padding:0 1.5rem}
.tab{padding:10px 18px;font-size:13px;font-weight:500;color:#aaa;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
.tab:hover{color:#fff}
.tab.active{color:#E8956D;border-bottom-color:#E8956D}
.tab-content{display:none}
.tab-content.active{display:block}

.container{max-width:960px;margin:0 auto;padding:1.5rem}
.btn-add{background:#C85B2A;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:1.25rem}

/* CATALOGO */
.car-card{background:#fff;border-radius:12px;padding:1rem 1.25rem;display:flex;gap:1rem;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:10px}
.car-foto{width:80px;height:60px;object-fit:cover;border-radius:8px;background:#eee;flex-shrink:0}
.car-info{flex:1}
.car-info strong{font-size:15px}
.car-info p{font-size:12px;color:#666;margin-top:2px}
.car-actions{display:flex;gap:6px}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px}
.badge-disponible{background:#E1F5EE;color:#085041}
.badge-reservada{background:#FAEEDA;color:#633806}
.badge-vendida{background:#eee;color:#666}

/* KANBAN */
.kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.k-col-header{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:0 0 10px;display:flex;align-items:center;justify-content:space-between}
.k-count{background:#e0e0e0;color:#555;font-size:11px;padding:2px 8px;border-radius:20px}
.k-count.nuevo{background:#fff3cd;color:#856404}
.k-count.respondido{background:#d1ecf1;color:#0c5460}
.k-count.cerrado{background:#e2e3e5;color:#383d41}
.k-col{background:#ebebeb;border-radius:10px;padding:14px;min-height:200px}
.k-card{background:#fff;border-radius:8px;padding:12px;margin-bottom:8px;border:1px solid #e8e8e8;font-size:13px}
.k-card-from{font-weight:600;margin-bottom:3px;font-size:13px}
.k-card-subject{font-size:11px;color:#666;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-card-body{font-size:11px;color:#888;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.k-card-date{font-size:10px;color:#bbb;margin-top:6px}
.k-card-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.k-btn{font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #ddd;background:#fff;cursor:pointer;color:#444}
.k-btn:hover{background:#f5f5f5}
.k-btn.primary{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.k-empty{text-align:center;color:#bbb;font-size:12px;padding:30px 0}

/* ALERTAS */
.alertas-grid{display:grid;gap:10px}
.alerta-card{background:#fff;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.alerta-top{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.alerta-titulo{font-weight:600;font-size:14px;margin-bottom:4px}
.alerta-meta{font-size:12px;color:#666;display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
.alerta-meta span{display:flex;align-items:center;gap:4px}
.alerta-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.interes-btn{font-size:11px;padding:3px 9px;border-radius:20px;border:1px solid #ddd;cursor:pointer;background:#fff}
.interes-btn.alto{background:#E1F5EE;color:#085041;border-color:#085041}
.interes-btn.medio{background:#fff3cd;color:#856404;border-color:#856404}
.interes-btn.bajo{background:#eee;color:#666;border-color:#aaa}
.estado-sel{font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer}
.alerta-link{font-size:11px;color:#C85B2A;text-decoration:none}
.alerta-link:hover{text-decoration:underline}
.score{font-size:13px;font-weight:700;padding:4px 10px;border-radius:8px;background:#F5F2EC;white-space:nowrap}
.score.alto{color:#085041}
.score.medio{color:#856404}
.score.bajo{color:#888}
.filtros{display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap}
.filtro-btn{font-size:12px;padding:5px 12px;border-radius:20px;border:1px solid #ddd;background:#fff;cursor:pointer;color:#444}
.filtro-btn.active{background:#2C2C2A;color:#fff;border-color:#2C2C2A}

/* MODAL */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;align-items:center;justify-content:center;padding:1rem}
.overlay.open{display:flex}
.modal{background:#fff;border-radius:16px;padding:1.5rem;width:100%;max-width:540px;max-height:90vh;overflow-y:auto}
.modal h2{font-size:18px;margin-bottom:1.25rem}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form-actions{display:flex;gap:10px;margin-top:1rem}
label{font-size:12px;font-weight:500;color:#444;display:block;margin-bottom:3px}
.form-group{margin-bottom:10px}
.hint{font-size:11px;color:#888;margin-top:4px}
.foto-preview{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.foto-preview img{width:72px;height:54px;object-fit:cover;border-radius:6px;background:#eee}
.error{color:#c00;font-size:12px;margin-top:6px;display:none}
.saving{opacity:.5;pointer-events:none}
.loading-msg{text-align:center;padding:40px;color:#888;font-size:14px}
@media(max-width:768px){.kanban{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}.alerta-top{flex-direction:column}}
</style>
</head>
<body>

<div id="app">
  <div class="header">
    <h1>🚐 Caravanas Sur — Admin</h1>
    <a href="/" target="_blank">Ver web →</a>
  </div>
  <div class="tabs">
    <div class="tab active" onclick="showTab('catalogo')">🚐 Catálogo</div>
    <div class="tab" onclick="showTab('mensajes')">📬 Mensajes</div>
    <div class="tab" onclick="showTab('alertas')">🔍 Alertas</div>
  </div>

  <!-- CATÁLOGO -->
  <div class="tab-content active" id="tab-catalogo">
    <div class="container">
      <button class="btn-add" onclick="abrirModal()">+ Nueva caravana</button>
      <div id="lista"></div>
    </div>
  </div>

  <!-- MENSAJES KANBAN -->
  <div class="tab-content" id="tab-mensajes">
    <div class="container">
      <div id="kanban-board" class="loading-msg">Cargando mensajes...</div>
    </div>
  </div>

  <!-- ALERTAS -->
  <div class="tab-content" id="tab-alertas">
    <div class="container">
      <div class="filtros">
        <button class="filtro-btn active" onclick="filtrarAlertas('todos',this)">Todos</button>
        <button class="filtro-btn" onclick="filtrarAlertas('Por ver',this)">Por ver</button>
        <button class="filtro-btn" onclick="filtrarAlertas('Contactado',this)">Contactado</button>
        <button class="filtro-btn" onclick="filtrarAlertas('Descartado',this)">Descartado</button>
      </div>
      <div id="alertas-board" class="loading-msg">Cargando alertas...</div>
    </div>
  </div>
</div>

<!-- MODAL CARAVANA -->
<div class="overlay" id="overlay">
  <div class="modal">
    <h2 id="modal-title">Nueva caravana</h2>
    <input type="hidden" id="f-id">
    <div class="form-row">
      <div class="form-group"><label>Marca y modelo *</label><input id="f-marca" placeholder="Hobby 440 SF"></div>
      <div class="form-group"><label>Año *</label><input id="f-año" type="number" placeholder="2008"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Plazas</label><input id="f-plazas" type="number" placeholder="4"></div>
      <div class="form-group"><label>Peso</label><input id="f-peso" placeholder="740 kg"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Precio (€) *</label><input id="f-precio" type="number" placeholder="5800"></div>
      <div class="form-group"><label>Estado</label>
        <select id="f-estado">
          <option value="disponible">Disponible</option>
          <option value="reservada">Reservada</option>
          <option value="vendida">Vendida</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Extras</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;" id="extras-checks">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Toldo"> Toldo</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Nevera"> Nevera</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Mover"> Mover</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Calefacción"> Calefacción</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Baño"> Baño</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="TV"> TV</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="A/C"> A/C</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Panel solar"> Panel solar</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Estabilizadores"> Estabilizadores</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Baca"> Baca</label>
      </div>
    </div>
    <div class="form-group"><label>Descripción</label><textarea id="f-desc" placeholder="Estado general, detalles..."></textarea></div>
    <div class="form-group">
      <label>URLs de fotos (una por línea)</label>
      <textarea id="f-fotos" placeholder="https://..." style="min-height:70px" oninput="previewFotos()"></textarea>
      <p class="hint">Sube fotos a /fotos del repo GitHub</p>
      <div class="foto-preview" id="foto-preview"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-guardar" onclick="guardar()" style="flex:1">Guardar</button>
      <button class="btn btn-sm btn-cancel" onclick="cerrarModal()">Cancelar</button>
    </div>
    <p class="error" id="form-err">Marca, año y precio son obligatorios</p>
  </div>
</div>

<script>
const ADMIN_PWD = "laurent2026";
let cars = [];
let mensajes = [];
let alertas = [];
let filtroAlerta = 'todos';

async function apiCall(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try { data = await res.json(); } catch(e) { data = { error: "Respuesta inválida" }; }
  if (!res.ok) throw new Error(data.error || "Error HTTP " + res.status);
  return data;
}

// Auto-load on start
document.getElementById("app").style.display = "block";
cargarCatalogo();

// ── TABS ──────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => {
    const names = ['catalogo','mensajes','alertas'];
    t.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'mensajes' && !mensajes.length) cargarMensajes();
  if (name === 'alertas' && !alertas.length) cargarAlertas();
}

// ── CATÁLOGO ──────────────────────────────────────────────
async function cargarCatalogo() {
  cars = await apiCall("GET", "/api/admin/caravanas");
  renderCatalogo();
}

function renderCatalogo() {
  const el = document.getElementById("lista");
  if (!cars.length) { el.innerHTML = '<p style="color:#888;font-size:14px">Sin caravanas. Añade la primera.</p>'; return; }
  el.innerHTML = cars.map(c => \`
    <div class="car-card">
      <img class="car-foto" src="\${c.fotos?.[0]||''}" onerror="this.style.background='#eee'" alt="">
      <div class="car-info">
        <strong>\${c.marca} (\${c.año})</strong>
        <span class="badge badge-\${c.estado}">\${c.estado}</span>
        <p>\${c.plazas} plazas · \${c.peso} · \${Number(c.precio).toLocaleString('es-ES')} €</p>
      </div>
      <div class="car-actions">
        <button class="btn btn-sm btn-edit" onclick="editar('\${c.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminar('\${c.id}')">Eliminar</button>
      </div>
    </div>
  \`).join('');
}

// ── MENSAJES KANBAN ───────────────────────────────────────
async function cargarMensajes() {
  document.getElementById("kanban-board").innerHTML = '<div class="loading-msg">Cargando mensajes...</div>';
  try {
    mensajes = await fetch('/api/mensajes').then(r => r.json());
    renderKanban();
  } catch(e) {
    document.getElementById("kanban-board").innerHTML = '<div class="loading-msg">⚠️ Error cargando mensajes. Verifica que el Sheet es público.</div>';
  }
}

function initials(str) {
  return (str||'').split(/[@._]/)[0].substring(0,2).toUpperCase();
}

function renderKanban() {
  const cols = ["Nuevo","Respondido","Cerrado"];
  const labels = { Nuevo:"🔔 Nuevo", Respondido:"💬 Respondido", Cerrado:"✅ Cerrado" };
  const countCls = { Nuevo:"nuevo", Respondido:"respondido", Cerrado:"cerrado" };
  let html = '<div class="kanban">';
  cols.forEach(estado => {
    const items = mensajes.filter(m => (m.estado||"Nuevo") === estado);
    html += \`<div>
      <div class="k-col-header"><span>\${labels[estado]}</span><span class="k-count \${countCls[estado]}">\${items.length}</span></div>
      <div class="k-col">\${items.length ? items.map(m => renderMsgCard(m)).join('') : '<div class="k-empty">Sin mensajes</div>'}</div>
    </div>\`;
  });
  html += '</div>';
  document.getElementById("kanban-board").innerHTML = html;
}

function renderMsgCard(m) {
  const ini = initials(m.de);
  const nombre = (m.de||'').split('<')[0].trim() || (m.de||'').split('@')[0];
  let acciones = '';
  if (m.estado === 'Nuevo' || !m.estado) {
    acciones = \`<button class="k-btn primary" onclick="cambiarEstadoMsg(\${m.id},\${m.fila},'Respondido')">Respondido</button>
                 <button class="k-btn" onclick="cambiarEstadoMsg(\${m.id},\${m.fila},'Cerrado')">Cerrar</button>\`;
  } else if (m.estado === 'Respondido') {
    acciones = \`<button class="k-btn" onclick="cambiarEstadoMsg(\${m.id},\${m.fila},'Cerrado')">Cerrar</button>
                 <button class="k-btn" onclick="cambiarEstadoMsg(\${m.id},\${m.fila},'Nuevo')">Reabrir</button>\`;
  } else {
    acciones = \`<button class="k-btn" onclick="cambiarEstadoMsg(\${m.id},\${m.fila},'Nuevo')">Reabrir</button>\`;
  }
  return \`<div class="k-card">
    <div class="k-card-from">\${nombre}</div>
    <div class="k-card-subject">\${m.asunto||''}</div>
    <div class="k-card-body">\${m.mensaje||''}</div>
    <div class="k-card-date">\${m.fecha||''}</div>
    <div class="k-card-actions">\${acciones}</div>
  </div>\`;
}

async function cambiarEstadoMsg(id, fila, nuevoEstado) {
  mensajes[id].estado = nuevoEstado;
  renderKanban();
  await fetch('/api/mensajes/estado', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fila, estado: nuevoEstado}) });
}

// ── ALERTAS ───────────────────────────────────────────────
async function cargarAlertas() {
  document.getElementById("alertas-board").innerHTML = '<div class="loading-msg">Cargando alertas...</div>';
  try {
    alertas = await fetch('/api/alertas').then(r => r.json());
    renderAlertas();
  } catch(e) {
    document.getElementById("alertas-board").innerHTML = '<div class="loading-msg">⚠️ Error cargando alertas.</div>';
  }
}

function calcScore(a) {
  let s = 5;
  const precio = parseInt((a.precio||'').replace(/[^\d]/g,'')) || 0;
  const anio = parseInt(a.anio) || 0;
  if (precio > 0 && precio < 3000) s += 2;
  else if (precio < 4500) s += 1;
  else if (precio > 6000) s -= 2;
  if (anio >= 2010) s += 2;
  else if (anio >= 2005) s += 1;
  else if (anio > 0 && anio < 2000) s -= 1;
  return Math.max(1, Math.min(10, s));
}

function scoreCls(s) { return s >= 7 ? 'alto' : s >= 5 ? 'medio' : 'bajo'; }

function filtrarAlertas(estado, btn) {
  filtroAlerta = estado;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAlertas();
}

function renderAlertas() {
  const filtradas = filtroAlerta === 'todos' ? alertas : alertas.filter(a => (a.estado||'Por ver') === filtroAlerta);
  if (!filtradas.length) { document.getElementById("alertas-board").innerHTML = '<div class="loading-msg">Sin alertas en esta categoría.</div>'; return; }
  document.getElementById("alertas-board").innerHTML = '<div class="alertas-grid">' + filtradas.map(a => renderAlertaCard(a)).join('') + '</div>';
}

function renderAlertaCard(a) {
  const score = calcScore(a);
  const scls = scoreCls(score);
  const interesVal = a.interes || '';
  const estadoVal = a.estado || 'Por ver';
  return \`<div class="alerta-card" id="alerta-\${a.id}">
    <div class="alerta-top">
      <div style="flex:1">
        <div class="alerta-titulo">\${a.titulo||'Sin título'}</div>
        <div class="alerta-meta">
          \${a.precio ? \`<span>💰 \${a.precio}</span>\` : ''}
          \${a.anio ? \`<span>📅 \${a.anio}</span>\` : ''}
          \${a.localiz ? \`<span>📍 \${a.localiz}</span>\` : ''}
          \${a.vendedor ? \`<span>👤 \${a.vendedor}</span>\` : ''}
          \${a.fecha ? \`<span style="color:#bbb">\${a.fecha}</span>\` : ''}
        </div>
        <div class="alerta-actions">
          <button class="interes-btn \${interesVal==='Alto'?'alto':''}" onclick="setInteres(\${a.id},\${a.fila},'Alto')">⭐ Alto</button>
          <button class="interes-btn \${interesVal==='Medio'?'medio':''}" onclick="setInteres(\${a.id},\${a.fila},'Medio')">Medio</button>
          <button class="interes-btn \${interesVal==='Bajo'?'bajo':''}" onclick="setInteres(\${a.id},\${a.fila},'Bajo')">Bajo</button>
          <select class="estado-sel" onchange="setEstadoAlerta(\${a.id},\${a.fila},this.value)">
            <option \${estadoVal==='Por ver'?'selected':''}>Por ver</option>
            <option \${estadoVal==='Contactado'?'selected':''}>Contactado</option>
            <option \${estadoVal==='Descartado'?'selected':''}>Descartado</option>
          </select>
          \${a.link ? \`<a class="alerta-link" href="\${a.link}" target="_blank">Ver anuncio →</a>\` : ''}
        </div>
      </div>
      <div class="score \${scls}">\${score}/10</div>
    </div>
  </div>\`;
}

async function setInteres(id, fila, interes) {
  const a = alertas.find(x => x.id === id);
  if (a) a.interes = interes;
  renderAlertas();
  await fetch('/api/alertas/estado', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fila, interes, estado: alertas.find(x=>x.id===id)?.estado||'Por ver'}) });
}

async function setEstadoAlerta(id, fila, estado) {
  const a = alertas.find(x => x.id === id);
  if (a) a.estado = estado;
  await fetch('/api/alertas/estado', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fila, interes: a?.interes||'', estado}) });
}

// ── MODAL CARAVANA ────────────────────────────────────────
function abrirModal(c) {
  document.getElementById("modal-title").textContent = c ? "Editar caravana" : "Nueva caravana";
  document.getElementById("f-id").value     = c?.id||"";
  document.getElementById("f-marca").value  = c?.marca||"";
  document.getElementById("f-año").value    = c?.año||"";
  document.getElementById("f-plazas").value = c?.plazas||"";
  document.getElementById("f-peso").value   = c?.peso||"";
  document.getElementById("f-precio").value = c?.precio||"";
  document.getElementById("f-estado").value = c?.estado||"disponible";
  document.querySelectorAll('#extras-checks input[type=checkbox]').forEach(cb => { cb.checked = (c?.extras||[]).includes(cb.value); });
  document.getElementById("f-desc").value   = c?.descripcion||"";
  document.getElementById("f-fotos").value  = (c?.fotos||[]).join("\\n");
  document.getElementById("form-err").style.display = "none";
  previewFotos();
  document.getElementById("overlay").classList.add("open");
}

function cerrarModal() { document.getElementById("overlay").classList.remove("open"); }
function editar(id) { abrirModal(cars.find(c => c.id === id)); }
function previewFotos() {
  const urls = document.getElementById("f-fotos").value.split("\\n").map(u=>u.trim()).filter(Boolean);
  document.getElementById("foto-preview").innerHTML = urls.map(u => \`<img src="\${u}" onerror="this.style.background='#eee'" alt="">\`).join('');
}

async function guardar() {
  const id = document.getElementById("f-id").value;
  const marca = document.getElementById("f-marca").value.trim();
  const año = parseInt(document.getElementById("f-año").value);
  const precio = parseInt(document.getElementById("f-precio").value);
  if (!marca || !año || !precio) { document.getElementById("form-err").style.display = "block"; return; }
  const data = {
    marca, año, precio,
    plazas:      parseInt(document.getElementById("f-plazas").value)||4,
    peso:        document.getElementById("f-peso").value.trim(),
    estado:      document.getElementById("f-estado").value,
    extras:      [...document.querySelectorAll('#extras-checks input[type=checkbox]:checked')].map(cb=>cb.value),
    descripcion: document.getElementById("f-desc").value.trim(),
    fotos:       document.getElementById("f-fotos").value.split("\\n").map(u=>u.trim()).filter(Boolean),
  };
  const btn = document.getElementById("btn-guardar");
  btn.textContent = "Guardando..."; btn.classList.add("saving");
  try {
    if (id) await apiCall("PUT", "/api/admin/caravanas/" + id, data);
    else    await apiCall("POST", "/api/admin/caravanas", data);
    cars = await apiCall("GET", "/api/admin/caravanas");
    renderCatalogo(); cerrarModal();
  } catch (err) {
    const errEl = document.getElementById("form-err");
    errEl.textContent = "Error: " + err.message;
    errEl.style.display = "block";
  }
  btn.textContent = "Guardar"; btn.classList.remove("saving");
}

async function eliminar(id) {
  if (!confirm("¿Eliminar esta caravana?")) return;
  await apiCall("DELETE", "/api/admin/caravanas/" + id);
  cars = await apiCall("GET", "/api/admin/caravanas");
  renderCatalogo();
}

document.getElementById("overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("overlay")) cerrarModal();
});
</script>
</body>
</html>`;
}
