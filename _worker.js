// ═══════════════════════════════════════════════════════════
// Caravanas Sur — Worker con CMS via GitHub
// ═══════════════════════════════════════════════════════════

const GITHUB_REPO    = "salirenbuscadore/caravanas-sur";
const GITHUB_BRANCH  = "main";
const JSON_FILE      = "caravanas.json";
const ADMIN_PASSWORD = "laurent2026";

// Lecturas públicas: raw.githubusercontent.com (repo público, sin token necesario)
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

// Escrituras (admin): requieren env.GITHUB_TOKEN configurado en Cloudflare
function ghHeaders(env) {
  return {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    "User-Agent": "caravanas-sur"
  };
}

async function getCaravanasPublic() {
  const res = await fetch(`${RAW_BASE}/${JSON_FILE}?t=${Date.now()}`);
  if (!res.ok) return [];
  return res.json();
}

async function getCaravanasAdmin(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado en Cloudflare");
  }
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`,
    { headers: ghHeaders(env) }
  );
  const data = await res.json();
  if (!res.ok || !data.content) {
    throw new Error("GitHub respondió: " + (data.message || res.status) + " (revisa que el token tenga permiso 'repo' y acceso a " + GITHUB_REPO + ")");
  }
  const decoded = atob(data.content.replace(/\n/g, ''));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, c => c.charCodeAt(0))));
}

async function saveCaravanas(env, caravanas) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no configurado en Cloudflare (Settings → Variables y secretos)");
  }
  const shaRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`,
    { headers: ghHeaders(env) }
  );
  const shaData = await shaRes.json();
  if (!shaRes.ok || !shaData.sha) {
    throw new Error("No se pudo leer el SHA del archivo: " + (shaData.message || shaRes.status));
  }
  const sha = shaData.sha;
  const fileContent = btoa(unescape(encodeURIComponent(JSON.stringify(caravanas, null, 2))));
  const putRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`,
    {
      method: "PUT",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "CMS: actualizar catálogo", content: fileContent, sha, branch: GITHUB_BRANCH })
    }
  );
  if (!putRes.ok) {
    const errData = await putRes.json().catch(()=>({}));
    throw new Error("GitHub PUT falló: " + (errData.message || putRes.status));
  }
}

async function syncSheet(caravanas) {
  const WEBHOOK = "https://script.google.com/macros/s/AKfycbybZWITX-1AyY37UUuNyeDQv6onIDjxO7Nx71Lqy7i_Q35rOvPelD-lCxNXZ_y95KPj/exec";
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "catalogo", caravanas })
    });
  } catch (e) { console.log("Sheet sync error:", e); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function fetchPublic(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) return new Response("Not found", { status: 404 });
  const text = await res.text();
  return new Response(text, {
    headers: { "Content-Type": path.endsWith(".html") ? "text/html;charset=UTF-8" : "application/octet-stream" }
  });
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } });
    }

    // ── API pública (sin token, repo público) ──────────────
    if (path === "/api/caravanas" && method === "GET") {
      return json(await getCaravanasPublic());
    }

    // ── API admin (requiere GITHUB_TOKEN + contraseña) ─────
    if (path.startsWith("/api/admin")) {
      const auth = request.headers.get("X-Admin-Password");
      if (auth !== ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401);

      try {
        if (path === "/api/admin/caravanas" && method === "GET") {
          return json(await getCaravanasAdmin(env));
        }
        if (path === "/api/admin/caravanas" && method === "POST") {
          const body = await request.json();
          const list = await getCaravanasAdmin(env);
          body.id = Date.now().toString();
          list.push(body);
          await saveCaravanas(env, list);
          await syncSheet(list);
          return json({ ok: true, id: body.id });
        }
        if (path.startsWith("/api/admin/caravanas/") && method === "PUT") {
          const id   = path.split("/").pop();
          const body = await request.json();
          let list   = await getCaravanasAdmin(env);
          list       = list.map(c => c.id === id ? { ...body, id } : c);
          await saveCaravanas(env, list);
          await syncSheet(list);
          return json({ ok: true });
        }
        if (path.startsWith("/api/admin/caravanas/") && method === "DELETE") {
          const id = path.split("/").pop();
          let list = await getCaravanasAdmin(env);
          list     = list.filter(c => c.id !== id);
          await saveCaravanas(env, list);
          await syncSheet(list);
          return json({ ok: true });
        }
      } catch (err) {
        return json({ error: err.message || "Error desconocido en el servidor" }, 500);
      }
    }

    // ── Admin HTML ─────────────────────────────────────────
    if (path === "/admin" || path === "/admin/") {
      return new Response(adminHTML(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // ── Páginas públicas (raw.githubusercontent, sin token) ─
    if (path === "/" || path === "/index.html") return fetchPublic("index.html");
    if (path === "/vendeurs.html" || path === "/vendeurs") return fetchPublic("vendeurs.html");
    if (path === "/mensajes" || path === "/mensajes.html") return fetchPublic("mensajes.html");
    if (path.startsWith("/fotos/")) return fetchPublic(path.slice(1));


    // ── Mensajes leboncoin (proxy Google Sheet) ────────────
    if (path === "/api/mensajes" && method === "GET") {
      const SHEET_ID = "1yCy5ckZk7hMWQkKfktd5qn0u_goFsNtv0yOSh57py94";
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=mensajes`;
      const res = await fetch(url);
      const text = await res.text();
      try {
        const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1];
        const parsed = JSON.parse(jsonStr);
        const rows = parsed.table.rows;
        const mensajes = rows.slice(0).map((row, i) => ({
          id: i,
          fecha: row.c[0]?.v || "",
          de: row.c[1]?.v || "",
          asunto: row.c[2]?.v || "",
          mensaje: row.c[3]?.v || "",
          estado: row.c[4]?.v || "Nuevo"
        }));
        return json(mensajes);
      } catch(e) {
        return json({ error: "Error parseando Sheet: " + e.message }, 500);
      }
    }

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
  .login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login-box{background:#fff;border-radius:16px;padding:2rem;width:320px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .login-box h1{font-size:20px;margin-bottom:1rem}
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
  .container{max-width:860px;margin:0 auto;padding:1.5rem}
  .btn-add{background:#C85B2A;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:1.25rem}
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
</style>
</head>
<body>

<div class="login-wrap" id="login">
  <div class="login-box">
    <h1>🚐 Admin Caravanas Sur</h1>
    <p style="font-size:13px;color:#666;margin-bottom:1rem">Contraseña para acceder</p>
    <input type="password" id="pwd" placeholder="Contraseña" onkeydown="if(event.key==='Enter')login()">
    <button class="btn btn-primary" onclick="login()">Entrar</button>
    <p class="error" id="login-err">Contraseña incorrecta</p>
  </div>
</div>

<div id="app">
  <div class="header">
    <h1>🚐 Caravanas Sur — CMS</h1>
    <a href="/" target="_blank">Ver web →</a>
  </div>
  <div class="container">
    <button class="btn-add" onclick="abrirModal()">+ Nueva caravana</button>
    <div id="lista"></div>
  </div>
</div>

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
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Despertador solar"> Despertador solar</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Estabilizadores"> Estabilizadores</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Panel solar"> Panel solar</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Baca"> Baca</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:400;cursor:pointer"><input type="checkbox" value="Ducha exterior"> Ducha exterior</label>
      </div>
    </div>
    <div class="form-group"><label>Descripción</label><textarea id="f-desc" placeholder="Estado general, detalles..."></textarea></div>
    <div class="form-group">
      <label>URLs de fotos (una por línea)</label>
      <textarea id="f-fotos" placeholder="https://..." style="min-height:70px" oninput="previewFotos()"></textarea>
      <p class="hint">Sube fotos a la carpeta /fotos del repo GitHub y pega la URL aquí</p>
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

async function apiCall(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try { data = await res.json(); } catch(e) { data = { error: "Respuesta inválida del servidor" }; }
  if (!res.ok) {
    throw new Error(data.error || ("Error HTTP " + res.status));
  }
  return data;
}

function login() {
  const pwd = document.getElementById("pwd").value;
  if (pwd !== ADMIN_PWD) {
    document.getElementById("login-err").style.display = "block"; return;
  }
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
  apiCall("GET", "/api/admin/caravanas").then(data => { cars = data; render(); });
}

function render() {
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

function abrirModal(c) {
  document.getElementById("modal-title").textContent = c ? "Editar caravana" : "Nueva caravana";
  document.getElementById("f-id").value     = c?.id||"";
  document.getElementById("f-marca").value  = c?.marca||"";
  document.getElementById("f-año").value    = c?.año||"";
  document.getElementById("f-plazas").value = c?.plazas||"";
  document.getElementById("f-peso").value   = c?.peso||"";
  document.getElementById("f-precio").value = c?.precio||"";
  document.getElementById("f-estado").value = c?.estado||"disponible";
  document.querySelectorAll('#extras-checks input[type=checkbox]').forEach(cb => {
    cb.checked = (c?.extras||[]).includes(cb.value);
  });
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
  document.getElementById("foto-preview").innerHTML = urls.map(u =>
    \`<img src="\${u}" onerror="this.style.background='#eee'" alt="">\`
  ).join('');
}

async function guardar() {
  const id     = document.getElementById("f-id").value;
  const marca  = document.getElementById("f-marca").value.trim();
  const año    = parseInt(document.getElementById("f-año").value);
  const precio = parseInt(document.getElementById("f-precio").value);
  if (!marca || !año || !precio) {
    document.getElementById("form-err").style.display = "block"; return;
  }
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
    if (id) {
      await apiCall("PUT", "/api/admin/caravanas/" + id, data);
    } else {
      await apiCall("POST", "/api/admin/caravanas", data);
    }
    cars = await apiCall("GET", "/api/admin/caravanas");
    render();
    cerrarModal();
  } catch (err) {
    const errEl = document.getElementById("form-err");
    errEl.textContent = "Error al guardar: " + err.message;
    errEl.style.display = "block";
  }
  btn.textContent = "Guardar"; btn.classList.remove("saving");
}

async function eliminar(id) {
  if (!confirm("¿Eliminar esta caravana?")) return;
  await apiCall("DELETE", "/api/admin/caravanas/" + id);
  cars = await apiCall("GET", "/api/admin/caravanas");
  render();
}

document.getElementById("overlay").addEventListener("click", e => {
  if (e.target===document.getElementById("overlay")) cerrarModal();
});
</script>
</body>
</html>`;
}
