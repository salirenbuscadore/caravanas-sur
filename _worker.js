// ═══════════════════════════════════════════════════════════
// Caravanas Sur — Worker con CMS
// ═══════════════════════════════════════════════════════════

const ADMIN_PASSWORD = "laurent2026";
const KV_KEY = "caravanas";

// Caravanas por defecto (primera carga)
const CARAVANAS_DEFAULT = [
  {
    id: "1", marca: "Caravelair Ariane 390", año: 2003, plazas: 4, peso: "680 kg",
    precio: 3200, estado: "disponible",
    fotos: ["https://images.unsplash.com/photo-1533591380348-14193f1de18f?w=800&q=80"],
    descripcion: "Caravana familiar en muy buen estado. Sin humedad verificada.",
    extras: ["Toldo", "Nevera", "Baño"]
  },
  {
    id: "2", marca: "Bürstner Premio 430", año: 2006, plazas: 4, peso: "720 kg",
    precio: 4100, estado: "disponible",
    fotos: ["https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=800&q=80"],
    descripcion: "Bürstner alemana, calidad premium. Interior impecable.",
    extras: ["Mover", "Calefacción", "TV"]
  },
  {
    id: "3", marca: "Hobby 440 SF", año: 2008, plazas: 4, peso: "740 kg",
    precio: 5800, estado: "reservada",
    fotos: ["https://images.unsplash.com/photo-1563299796-17596ed6b017?w=800&q=80"],
    descripcion: "Reservada — disponible en 2–3 semanas.",
    extras: ["Toldo", "Nevera", "A/C"]
  }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── API caravanas ──────────────────────────────────────
    if (path === "/api/caravanas") {
      // GET — lista pública
      if (request.method === "GET") {
        const data = await getCaravanas(env);
        return json(data);
      }
    }

    // ── API admin (protegida) ──────────────────────────────
    if (path.startsWith("/api/admin/")) {
      const auth = request.headers.get("X-Admin-Password");
      if (auth !== ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });

      const action = path.replace("/api/admin/", "");

      if (action === "caravanas" && request.method === "GET") {
        return json(await getCaravanas(env));
      }

      if (action === "caravanas" && request.method === "POST") {
        const body = await request.json();
        const caravanas = await getCaravanas(env);
        body.id = Date.now().toString();
        caravanas.push(body);
        await saveCaravanas(env, caravanas);
        return json({ ok: true, id: body.id });
      }

      if (action.startsWith("caravanas/") && request.method === "PUT") {
        const id = action.replace("caravanas/", "");
        const body = await request.json();
        let caravanas = await getCaravanas(env);
        caravanas = caravanas.map(c => c.id === id ? { ...body, id } : c);
        await saveCaravanas(env, caravanas);
        return json({ ok: true });
      }

      if (action.startsWith("caravanas/") && request.method === "DELETE") {
        const id = action.replace("caravanas/", "");
        let caravanas = await getCaravanas(env);
        caravanas = caravanas.filter(c => c.id !== id);
        await saveCaravanas(env, caravanas);
        return json({ ok: true });
      }
    }

    // ── Admin HTML ─────────────────────────────────────────
    if (path === "/admin" || path === "/admin/") {
      return new Response(adminHTML(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // ── Fotos desde GitHub ─────────────────────────────────
    if (path.startsWith("/fotos/")) {
      const fotoUrl = `https://raw.githubusercontent.com/salirenbuscadore/caravanas-sur/main${path}`;
      return fetch(fotoUrl);
    }

    // ── Páginas estáticas ──────────────────────────────────
    if (path === "/" || path === "/index.html") {
      return fetchStatic("index.html");
    }
    if (path === "/vendeurs.html") {
      return fetchStatic("vendeurs.html");
    }

    return new Response("Not found", { status: 404 });
  }
};

async function getCaravanas(env) {
  try {
    const data = await env.CARAVANAS_KV.get(KV_KEY);
    return data ? JSON.parse(data) : CARAVANAS_DEFAULT;
  } catch {
    return CARAVANAS_DEFAULT;
  }
}

async function saveCaravanas(env, caravanas) {
  await env.CARAVANAS_KV.put(KV_KEY, JSON.stringify(caravanas));
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function fetchStatic(file) {
  const url = `https://raw.githubusercontent.com/salirenbuscadore/caravanas-sur/main/${file}`;
  const res = await fetch(url);
  const html = await res.text();
  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" }
  });
}

function adminHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — Caravanas Sur</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #F5F2EC; color: #1C1A16; }
  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-box { background: #fff; border-radius: 16px; padding: 2rem; width: 320px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .login-box h1 { font-size: 20px; margin-bottom: 1rem; }
  .login-box input { width: 100%; padding: 10px 12px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 12px; }
  .btn-primary { width: 100%; padding: 11px; background: #C85B2A; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-danger { padding: 6px 12px; background: #dc3545; color: #fff; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
  .btn-edit { padding: 6px 12px; background: #2C2C2A; color: #fff; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
  .btn-secondary { padding: 6px 12px; background: #eee; color: #333; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
  #app { display: none; }
  .header { background: #2C2C2A; color: #F1EFE8; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 16px; }
  .header a { color: #E8956D; font-size: 13px; text-decoration: none; }
  .container { max-width: 900px; margin: 0 auto; padding: 1.5rem; }
  .btn-add { background: #C85B2A; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 1.5rem; }
  .card-list { display: flex; flex-direction: column; gap: 12px; }
  .car-card { background: #fff; border-radius: 12px; padding: 1rem 1.25rem; display: flex; gap: 1rem; align-items: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .car-foto { width: 80px; height: 60px; object-fit: cover; border-radius: 8px; background: #eee; flex-shrink: 0; }
  .car-info { flex: 1; }
  .car-info strong { font-size: 15px; }
  .car-info p { font-size: 12px; color: #666; margin-top: 2px; }
  .car-actions { display: flex; gap: 6px; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 20px; margin-left: 8px; }
  .badge-disponible { background: #E1F5EE; color: #085041; }
  .badge-reservada  { background: #FAEEDA; color: #633806; }
  .badge-vendida    { background: #eee; color: #666; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; align-items: center; justify-content: center; padding: 1rem; }
  .modal-overlay.open { display: flex; }
  .modal { background: #fff; border-radius: 16px; padding: 1.5rem; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
  .modal h2 { font-size: 18px; margin-bottom: 1.25rem; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .form-group { margin-bottom: 10px; }
  label { font-size: 12px; font-weight: 500; color: #444; display: block; margin-bottom: 4px; }
  input, select, textarea { width: 100%; padding: 9px 11px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 13px; font-family: inherit; }
  textarea { min-height: 80px; resize: vertical; }
  .form-actions { display: flex; gap: 10px; margin-top: 1rem; }
  .foto-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .foto-preview img { width: 80px; height: 60px; object-fit: cover; border-radius: 6px; }
  .foto-preview .del-foto { position: relative; }
  .foto-preview .del-foto button { position: absolute; top: -4px; right: -4px; background: #dc3545; color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; cursor: pointer; line-height: 18px; }
  .hint { font-size: 11px; color: #888; margin-top: 3px; }
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-wrap" id="login">
  <div class="login-box">
    <h1>🚐 Admin Caravanas Sur</h1>
    <p style="font-size:13px;color:#666;margin-bottom:1rem;">Introduce la contraseña para acceder</p>
    <input type="password" id="pwd" placeholder="Contraseña" onkeydown="if(event.key==='Enter')login()">
    <button class="btn-primary" onclick="login()">Entrar</button>
    <p id="login-error" style="color:#c00;font-size:12px;margin-top:8px;display:none;">Contraseña incorrecta</p>
  </div>
</div>

<!-- APP -->
<div id="app">
  <div class="header">
    <h1>🚐 Caravanas Sur — Admin</h1>
    <a href="/" target="_blank">Ver web →</a>
  </div>
  <div class="container">
    <button class="btn-add" onclick="abrirModal()">+ Añadir caravana</button>
    <div class="card-list" id="lista"></div>
  </div>
</div>

<!-- MODAL EDITAR/AÑADIR -->
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h2 id="modal-title">Nueva caravana</h2>
    <input type="hidden" id="f-id">
    <div class="form-row">
      <div class="form-group">
        <label>Marca y modelo *</label>
        <input id="f-marca" type="text" placeholder="Hobby 440 SF">
      </div>
      <div class="form-group">
        <label>Año *</label>
        <input id="f-año" type="number" placeholder="2008">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Plazas</label>
        <input id="f-plazas" type="number" placeholder="4">
      </div>
      <div class="form-group">
        <label>Peso (kg)</label>
        <input id="f-peso" type="text" placeholder="740 kg">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Precio (€) *</label>
        <input id="f-precio" type="number" placeholder="5800">
      </div>
      <div class="form-group">
        <label>Estado</label>
        <select id="f-estado">
          <option value="disponible">Disponible</option>
          <option value="reservada">Reservada</option>
          <option value="vendida">Vendida</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Extras (separados por comas)</label>
      <input id="f-extras" type="text" placeholder="Toldo, Nevera, Mover">
    </div>
    <div class="form-group">
      <label>Descripción</label>
      <textarea id="f-desc" placeholder="Estado general, detalles importantes..."></textarea>
    </div>
    <div class="form-group">
      <label>URLs de fotos (una por línea)</label>
      <textarea id="f-fotos" placeholder="https://raw.githubusercontent.com/salirenbuscadore/caravanas-sur/main/fotos/mi-foto.jpg" style="min-height:80px;"></textarea>
      <p class="hint">Sube las fotos a la carpeta /fotos del repo GitHub y pega la URL aquí</p>
      <div class="foto-preview" id="foto-preview"></div>
    </div>
    <div class="form-actions">
      <button class="btn-primary" onclick="guardar()" style="flex:1;">Guardar</button>
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
    </div>
  </div>
</div>

<script>
let pwd = "";
let caravanas = [];

function login() {
  pwd = document.getElementById("pwd").value;
  fetch("/api/admin/caravanas", { headers: { "X-Admin-Password": pwd } })
    .then(r => {
      if (!r.ok) throw new Error("401");
      return r.json();
    })
    .then(data => {
      caravanas = data;
      document.getElementById("login").style.display = "none";
      document.getElementById("app").style.display = "block";
      renderLista();
    })
    .catch(() => {
      document.getElementById("login-error").style.display = "block";
    });
}

function renderLista() {
  const el = document.getElementById("lista");
  if (!caravanas.length) {
    el.innerHTML = '<p style="color:#888;font-size:14px;">No hay caravanas. Añade la primera.</p>';
    return;
  }
  el.innerHTML = caravanas.map(c => `
    <div class="car-card">
      <img class="car-foto" src="${c.fotos?.[0] || ''}" onerror="this.style.background='#eee'" alt="">
      <div class="car-info">
        <strong>${c.marca} (${c.año})</strong>
        <span class="badge badge-${c.estado}">${c.estado}</span>
        <p>${c.plazas} plazas · ${c.peso} · ${Number(c.precio).toLocaleString('es-ES')} €</p>
      </div>
      <div class="car-actions">
        <button class="btn-edit" onclick="editar('${c.id}')">Editar</button>
        <button class="btn-danger" onclick="eliminar('${c.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function abrirModal(c) {
  document.getElementById("modal-title").textContent = c ? "Editar caravana" : "Nueva caravana";
  document.getElementById("f-id").value     = c?.id || "";
  document.getElementById("f-marca").value  = c?.marca || "";
  document.getElementById("f-año").value    = c?.año || "";
  document.getElementById("f-plazas").value = c?.plazas || "";
  document.getElementById("f-peso").value   = c?.peso || "";
  document.getElementById("f-precio").value = c?.precio || "";
  document.getElementById("f-estado").value = c?.estado || "disponible";
  document.getElementById("f-extras").value = (c?.extras || []).join(", ");
  document.getElementById("f-desc").value   = c?.descripcion || "";
  document.getElementById("f-fotos").value  = (c?.fotos || []).join("\n");
  actualizarFotos();
  document.getElementById("modal").classList.add("open");
}

function cerrarModal() {
  document.getElementById("modal").classList.remove("open");
}

function editar(id) {
  abrirModal(caravanas.find(c => c.id === id));
}

function actualizarFotos() {
  const urls = document.getElementById("f-fotos").value.split("\n").map(u => u.trim()).filter(Boolean);
  document.getElementById("foto-preview").innerHTML = urls.map(u =>
    `<div class="del-foto"><img src="${u}" onerror="this.style.background='#eee'"></div>`
  ).join('');
}
document.getElementById("f-fotos").addEventListener("input", actualizarFotos);

async function guardar() {
  const id = document.getElementById("f-id").value;
  const data = {
    marca:      document.getElementById("f-marca").value.trim(),
    año:        parseInt(document.getElementById("f-año").value),
    plazas:     parseInt(document.getElementById("f-plazas").value),
    peso:       document.getElementById("f-peso").value.trim(),
    precio:     parseInt(document.getElementById("f-precio").value),
    estado:     document.getElementById("f-estado").value,
    extras:     document.getElementById("f-extras").value.split(",").map(e => e.trim()).filter(Boolean),
    descripcion: document.getElementById("f-desc").value.trim(),
    fotos:      document.getElementById("f-fotos").value.split("\n").map(u => u.trim()).filter(Boolean),
  };
  if (!data.marca || !data.año || !data.precio) return alert("Marca, año y precio son obligatorios.");

  const url = id ? `/api/admin/caravanas/${id}` : "/api/admin/caravanas";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Password": pwd },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    const updated = await fetch("/api/admin/caravanas", { headers: { "X-Admin-Password": pwd } }).then(r => r.json());
    caravanas = updated;
    renderLista();
    cerrarModal();
  }
}

async function eliminar(id) {
  if (!confirm("¿Eliminar esta caravana?")) return;
  await fetch(`/api/admin/caravanas/${id}`, {
    method: "DELETE",
    headers: { "X-Admin-Password": pwd }
  });
  caravanas = caravanas.filter(c => c.id !== id);
  renderLista();
}

document.getElementById("modal").addEventListener("click", e => {
  if (e.target === document.getElementById("modal")) cerrarModal();
});
</script>
</body>
</html>`;
}
