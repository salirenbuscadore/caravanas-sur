// ═══════════════════════════════════════════════════════════
// Caravanas Sur — Worker con CMS via GitHub
// ═══════════════════════════════════════════════════════════

const ADMIN_PASSWORD = "laurent2026";
const GITHUB_REPO    = "salirenbuscadore/caravanas-sur";
const GITHUB_BRANCH  = "main";
const JSON_FILE      = "caravanas.json";

// Token GitHub guardado como variable de entorno en Cloudflare
// Se llama GITHUB_TOKEN

async function getCaravanas() {
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${JSON_FILE}?t=${Date.now()}`;
  const res = await fetch(url);
  return res.json();
}

async function saveCaravanas(env, caravanas) {
  // 1. Obtener SHA actual
  const shaRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`,
    { headers: { Authorization: `token ${env.GITHUB_TOKEN}`, "User-Agent": "caravanas-sur" } }
  );
  const shaData = await shaRes.json();
  const sha = shaData.sha;

  // 2. Subir nuevo contenido
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(caravanas, null, 2))));
  await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${JSON_FILE}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "caravanas-sur"
      },
      body: JSON.stringify({
        message: "CMS: actualizar catálogo",
        content,
        sha
      })
    }
  );
}

async function syncSheet(caravanas) {
  const WEBHOOK = "https://script.google.com/macros/s/AKfycbybZWITX-1AyY37UUuNyeDQv6onIDjxO7Nx71Lqy7i_Q35rOvPelD-lCxNXZ_y95KPj/exec";
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "catalogo", caravanas })
    });
  } catch(e) { console.log("Sheet sync error:", e); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function fetchGitHub(path) {
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}?t=${Date.now()}`;
  const res = await fetch(url);
  return new Response(await res.text(), {
    headers: { "Content-Type": path.endsWith(".html") ? "text/html;charset=UTF-8" : "application/octet-stream" }
  });
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } });
    }

    // ── API pública ────────────────────────────────────────
    if (path === "/api/caravanas" && method === "GET") {
      const data = await getCaravanas();
      return json(data);
    }

    // ── API admin ──────────────────────────────────────────
    if (path.startsWith("/api/admin")) {
      const auth = request.headers.get("X-Admin-Password");
      if (auth !== ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401);

      // GET lista
      if (path === "/api/admin/caravanas" && method === "GET") {
        return json(await getCaravanas());
      }

      // POST nueva
      if (path === "/api/admin/caravanas" && method === "POST") {
        const body = await request.json();
        const list = await getCaravanas();
        body.id = Date.now().toString();
        list.push(body);
        await saveCaravanas(env, list);
        await syncSheet(list);
        return json({ ok: true, id: body.id });
      }

      // PUT editar
      if (path.startsWith("/api/admin/caravanas/") && method === "PUT") {
        const id   = path.split("/").pop();
        const body = await request.json();
        let list   = await getCaravanas();
        list       = list.map(c => c.id === id ? { ...body, id } : c);
        await saveCaravanas(env, list);
        await syncSheet(list);
        return json({ ok: true });
      }

      // DELETE eliminar
      if (path.startsWith("/api/admin/caravanas/") && method === "DELETE") {
        const id = path.split("/").pop();
        let list = await getCaravanas();
        list     = list.filter(c => c.id !== id);
        await saveCaravanas(env, list);
        await syncSheet(list);
        return json({ ok: true });
      }
    }

    // ── Admin HTML ─────────────────────────────────────────
    if (path === "/admin" || path === "/admin/") {
      return new Response(adminHTML(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // ── Páginas estáticas ──────────────────────────────────
    if (path === "/" || path === "/index.html") return fetchGitHub("index.html");
    if (path === "/vendeurs.html")              return fetchGitHub("vendeurs.html");

    // ── Fotos desde GitHub ─────────────────────────────────
    if (path.startsWith("/fotos/")) return fetchGitHub(path.slice(1));

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
let pwd = "";
let cars = [];

function login() {
  pwd = document.getElementById("pwd").value;
  fetch("/api/admin/caravanas", { headers: { "X-Admin-Password": pwd } })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(data => {
      cars = data;
      document.getElementById("login").style.display = "none";
      document.getElementById("app").style.display = "block";
      render();
    })
    .catch(() => { document.getElementById("login-err").style.display = "block"; });
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
  // Marcar checkboxes de extras
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

  const url    = id ? \`/api/admin/caravanas/\${id}\` : "/api/admin/caravanas";
  const method = id ? "PUT" : "POST";
  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Password": pwd },
    body: JSON.stringify(data)
  });
  cars = await fetch("/api/admin/caravanas", { headers: { "X-Admin-Password": pwd } }).then(r=>r.json());
  render();
  cerrarModal();
  btn.textContent = "Guardar"; btn.classList.remove("saving");
}

async function eliminar(id) {
  if (!confirm("¿Eliminar esta caravana?")) return;
  await fetch(\`/api/admin/caravanas/\${id}\`, { method:"DELETE", headers:{"X-Admin-Password":pwd} });
  cars = cars.filter(c=>c.id!==id);
  render();
}

document.getElementById("overlay").addEventListener("click", e => {
  if (e.target===document.getElementById("overlay")) cerrarModal();
});
</script>
</body>
</html>`;
}
