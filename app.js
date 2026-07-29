// ======================================================================
// CONFIGURACIÓN — rellena estos dos valores antes de publicar
// ======================================================================
// URL raw del data.json en tu repo público de GitHub (rama main).
// Ejemplo: https://raw.githubusercontent.com/tuusuario/volvo-erad-tracker/main/data.json
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/noelarsu-gif/volvo-erad-tracker/main/data.json";

// URL del Cloudflare Worker que hace de proxy de escritura (paso 2 del README).
// Ejemplo: https://volvo-erad-proxy.tuusuario.workers.dev
const WORKER_URL = "https://TU-WORKER.workers.dev";

// ======================================================================

const STATUS_LABELS = {
  sin_diagnosticar: "Sin diagnosticar",
  esperando_pieza: "Esperando pieza",
  reparado: "Reparado",
};

const form = document.getElementById("case-form");
const statusField = document.getElementById("status");
const daysField = document.getElementById("days-field");
const formStatus = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const caseList = document.getElementById("case-list");
const refreshBtn = document.getElementById("refresh-btn");

function setFormStatus(msg, type) {
  formStatus.textContent = msg;
  formStatus.className = "form-status" + (type ? " " + type : "");
}

function daysAgo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

// ---------------------------------------------------------------------
// Envío de un caso nuevo
// ---------------------------------------------------------------------

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Honeypot: si un bot rellena este campo oculto, se descarta en silencio.
  if (form.website.value.trim() !== "") {
    setFormStatus("Gracias por tu registro.", "ok");
    form.reset();
    return;
  }

  if (!form.consent.checked) {
    setFormStatus("Necesitas aceptar la inclusión anónima de los datos para continuar.", "error");
    return;
  }

  const payload = {
    model_year: form.model_year.value.trim(),
    fail_date: form.fail_date.value,
    status: form.status.value,
    days_waiting: form.days_waiting.value ? Number(form.days_waiting.value) : (form.fail_date.value ? daysAgo(form.fail_date.value) : null),
    backorder: form.backorder.value,
    dealer: form.dealer.value.trim(),
  };

  if (!payload.model_year || !payload.fail_date || !payload.status || !payload.backorder || !payload.dealer) {
    setFormStatus("Faltan campos obligatorios.", "error");
    return;
  }

  submitBtn.disabled = true;
  setFormStatus("Enviando…", "");

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || ("Error " + res.status));
    }

    setFormStatus("Caso registrado. Gracias por documentar tu experiencia.", "ok");
    form.reset();
    setTimeout(loadCases, 1500); // el commit a GitHub tarda un instante en propagarse
  } catch (err) {
    setFormStatus("No se pudo registrar el caso: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
});

statusField.addEventListener("change", () => {
  daysField.style.display = statusField.value === "sin_diagnosticar" ? "none" : "block";
});

// ---------------------------------------------------------------------
// Lectura pública del listado
// ---------------------------------------------------------------------

async function loadCases() {
  caseList.innerHTML = '<p class="empty-state">Cargando expedientes…</p>';
  try {
    const res = await fetch(GITHUB_RAW_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer el registro (" + res.status + ")");
    const cases = await res.json();
    renderCases(cases);
    renderStats(cases);
  } catch (err) {
    caseList.innerHTML = '<p class="empty-state">Error al cargar los expedientes: ' + err.message + "</p>";
  }
}

function renderStats(cases) {
  const total = cases.length;
  const waiting = cases.filter((c) => c.status === "esperando_pieza").length;
  const withDays = cases.map((c) => c.days_waiting).filter((d) => typeof d === "number");
  const avg = withDays.length ? Math.round(withDays.reduce((a, b) => a + b, 0) / withDays.length) : 0;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-waiting").textContent = waiting;
  document.getElementById("stat-avgdays").textContent = withDays.length ? avg : "—";
}

function renderCases(cases) {
  if (!cases.length) {
    caseList.innerHTML = '<p class="empty-state">Todavía no hay casos registrados. Sé el primero.</p>';
    return;
  }

  const sorted = [...cases].sort((a, b) => new Date(b.fail_date) - new Date(a.fail_date));

  caseList.innerHTML = sorted
    .map((c, i) => {
      const num = String(cases.length - i).padStart(4, "0");
      const statusClass = "status-" + c.status;
      const statusLabel = STATUS_LABELS[c.status] || c.status;
      const days = typeof c.days_waiting === "number" ? c.days_waiting : null;

      return `
      <article class="case-card ${statusClass}">
        <div>
          <span class="case-id">CASE-${num}</span>
          <h3 class="case-model">${escapeHtml(c.model_year)}</h3>
          <div class="case-meta">
            <span class="status-pill">${statusLabel}</span>
            <span>Fallo: ${formatDate(c.fail_date)}</span>
            <span>Backorder: ${c.backorder === "si" ? "Sí" : c.backorder === "no" ? "No" : "No se sabe"}</span>
            <span>${escapeHtml(c.dealer)}</span>
          </div>
        </div>
        <div class="case-days">
          ${days !== null ? `<span class="n">${days}</span><span class="unit">días</span>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

refreshBtn.addEventListener("click", loadCases);

// ---------------------------------------------------------------------
// Service worker (PWA offline shell)
// ---------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

loadCases();
