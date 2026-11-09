// Frontend del pronóstico: consume /api/prediccion, /api/salud y /api/modelo.
const ZONA = "America/Bogota";
const $ = (id) => document.getElementById(id);

const fmtHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA, weekday: "short", day: "2-digit", month: "short",
  hour: "2-digit", minute: "2-digit", hour12: true,
});
const fmtCorta = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA, day: "2-digit", month: "short", hour: "2-digit", hour12: true,
});
const fmtNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

// La API entrega UTC con "Z": Date lo interpreta bien y Intl lo pasa a Colombia.
const horaCol = (iso) => fmtHora.format(new Date(iso));
const horaCorta = (iso) => fmtCorta.format(new Date(iso));

let grafica = null;
let unidad = "";

function css(variable) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function mostrarError(mensaje) {
  $("error-texto").textContent = mensaje;
  $("error").hidden = false;
}

async function pedir(url) {
  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch (e) {
    throw new Error("No hay conexión con la API. ¿Está corriendo uvicorn o el contenedor?");
  }
  let datos = null;
  try { datos = await respuesta.json(); } catch (_) { /* respuesta sin JSON */ }
  if (!respuesta.ok) {
    let detalle = datos && datos.detail;
    if (Array.isArray(detalle)) detalle = detalle.map((d) => d.msg).join("; ");
    throw new Error(`(${respuesta.status}) ${detalle || respuesta.statusText}`);
  }
  return datos;
}

async function cargarSalud() {
  const caja = $("estado-servicio");
  try {
    const s = await pedir("/api/salud");
    $("atendido-por").textContent = s.atendido_por;
    if (s.field) {
      $("titulo-variable").textContent = `de ${s.field.replace(/_/g, " ")}`;
    }
    const listo = s.modelo_cargado && (s.influx_configurado || s.modo_demo);
    caja.className = "estado-servicio " + (listo ? "ok" : "mal");
    $("texto-servicio").textContent = s.modo_demo ? "Modo demo" :
      listo ? "Conectado a InfluxDB" : "Configuración incompleta";
  } catch (e) {
    caja.className = "estado-servicio mal";
    $("texto-servicio").textContent = "API sin respuesta";
  }
}

async function cargarModelo() {
  try {
    const m = await pedir("/api/modelo");
    const orden = `SARIMA(${m.order.join(",")})×(${m.seasonal_order.join(",")})`;
    $("nombre-modelo").textContent = orden;
    const filas = [
      ["Órdenes", orden],
      ["Serie", `${m.measurement} / ${m.field}`],
      ["Entrenado", m.entrenado_en || "—"],
      ["Observaciones", m.n_observaciones ?? "—"],
    ];
    if (m.metricas_test) {
      filas.push(["MAE (prueba 24 h)", fmtNum.format(m.metricas_test.MAE)]);
      filas.push(["RMSE (prueba 24 h)", fmtNum.format(m.metricas_test.RMSE)]);
    }
    $("info-modelo").innerHTML = filas
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    $("panel-modelo").hidden = false;
  } catch (_) {
    $("panel-modelo").hidden = true;
  }
}

function pintarIndicadores(d) {
  const p = d.prediccion;
  const primero = p[0];
  $("kpi-proxima").textContent = fmtNum.format(primero.prediccion) + unidad;
  $("kpi-proxima-det").textContent =
    `${horaCol(primero.tiempo)} · entre ${fmtNum.format(primero.limite_inferior)} y ${fmtNum.format(primero.limite_superior)}`;

  const max = p.reduce((a, b) => (b.prediccion > a.prediccion ? b : a));
  const min = p.reduce((a, b) => (b.prediccion < a.prediccion ? b : a));
  $("kpi-max").textContent = fmtNum.format(max.prediccion) + unidad;
  $("kpi-max-det").textContent = horaCol(max.tiempo);
  $("kpi-min").textContent = fmtNum.format(min.prediccion) + unidad;
  $("kpi-min-det").textContent = horaCol(min.tiempo);

  const ultimo = d.historico.length ? d.historico[d.historico.length - 1] : null;
  $("kpi-ultimo").textContent = ultimo ? fmtNum.format(ultimo.valor) + unidad : "—";
  $("kpi-ultimo-det").textContent = horaCol(d.ultima_observacion);

  const relleno = d.horas_rellenadas || 0;
  $("nota-calidad").textContent = relleno > 0
    ? `⚠ ${relleno} de ${d.horas_contexto_usadas} horas de contexto no tenían dato y se rellenaron: el pronóstico puede ser menos confiable.`
    : `Contexto usado: ${d.horas_contexto_usadas} horas, sin huecos en los datos.`;
}

function pintarGrafica(d) {
  const h = d.historico;
  const p = d.prediccion;
  const etiquetas = [...h.map((x) => x.tiempo), ...p.map((x) => x.tiempo)];
  const nH = h.length;
  const vacio = (n) => Array(n).fill(null);

  // El pronóstico arranca desde el último dato real para que la línea sea continua.
  const ultimoReal = nH ? h[nH - 1].valor : null;
  const pron = [...vacio(Math.max(nH - 1, 0)), ...(nH ? [ultimoReal] : []), ...p.map((x) => x.prediccion)];
  const inf = [...vacio(Math.max(nH - 1, 0)), ...(nH ? [ultimoReal] : []), ...p.map((x) => x.limite_inferior)];
  const sup = [...vacio(Math.max(nH - 1, 0)), ...(nH ? [ultimoReal] : []), ...p.map((x) => x.limite_superior)];
  const hist = [...h.map((x) => x.valor), ...vacio(p.length)];

  const colores = { acento: css("--acento"), pron: css("--pron"), banda: css("--banda"),
                    texto: css("--suave"), borde: css("--borde") };

  const datasets = [
    { label: "Límite superior", data: sup, borderWidth: 0, pointRadius: 0, fill: false },
    { label: `Intervalo ${Math.round(d.confianza * 100)} %`, data: inf, borderWidth: 0, pointRadius: 0,
      backgroundColor: colores.banda, fill: "-1" },
    { label: "Histórico", data: hist, borderColor: colores.acento, borderWidth: 2,
      pointRadius: 0, tension: 0.25 },
    { label: "Pronóstico", data: pron, borderColor: colores.pron, borderWidth: 2.5,
      borderDash: [6, 4], pointRadius: 0, tension: 0.25 },
  ];

  if (grafica) grafica.destroy();
  grafica = new Chart($("grafica"), {
    type: "line",
    data: { labels: etiquetas, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, spanGaps: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => horaCol(etiquetas[items[0].dataIndex]) + " (Colombia)",
            label: (c) => (c.raw == null ? null : `${c.dataset.label}: ${fmtNum.format(c.raw)}${unidad}`),
          },
          filter: (c) => c.raw != null && !(c.datasetIndex === 3 && c.dataIndex === nH - 1),
        },
      },
      scales: {
        x: {
          ticks: { color: colores.texto, maxRotation: 0, autoSkip: true, maxTicksLimit: 10,
                   callback: (v, i) => horaCorta(etiquetas[i]) },
          grid: { color: colores.borde },
        },
        y: { ticks: { color: colores.texto }, grid: { color: colores.borde } },
      },
    },
  });
}

function pintarTabla(d) {
  $("filas").innerHTML = d.prediccion.map((p) => `
    <tr><td>${horaCol(p.tiempo)}</td>
        <td><strong>${fmtNum.format(p.prediccion)}</strong></td>
        <td>${fmtNum.format(p.limite_inferior)}</td>
        <td>${fmtNum.format(p.limite_superior)}</td></tr>`).join("");
  $("nota-tabla").textContent = `${d.prediccion.length} horas · intervalo ${Math.round(d.confianza * 100)} %`;
}

async function cargarPronostico() {
  const horas = $("horas").value;
  const historia = $("historia").value;
  const confianza = $("confianza").value;
  $("ley-conf").textContent = `${Math.round(confianza * 100)} %`;
  $("actualizar").disabled = true;
  $("actualizar").textContent = "Cargando…";
  $("error").hidden = true;
  try {
    const d = await pedir(`/api/prediccion?horas=${horas}&historia=${historia}&confianza=${confianza}`);
    if (!d.prediccion || !d.prediccion.length) throw new Error("La API no devolvió pronóstico.");
    pintarIndicadores(d);
    pintarGrafica(d);
    pintarTabla(d);
  } catch (e) {
    mostrarError(e.message);
  } finally {
    $("actualizar").disabled = false;
    $("actualizar").textContent = "Actualizar";
  }
}

// ---- Controles
function fijarHoras(h) {
  $("horas").value = h;
  $("horas-valor").textContent = `${h} h`;
  document.querySelectorAll(".atajos button").forEach((b) =>
    b.classList.toggle("activo", b.dataset.horas === String(h)));
}
let temporizador;
$("horas").addEventListener("input", (e) => {
  fijarHoras(e.target.value);
  clearTimeout(temporizador);
  temporizador = setTimeout(cargarPronostico, 400);
});
document.querySelectorAll(".atajos button").forEach((b) =>
  b.addEventListener("click", () => { fijarHoras(b.dataset.horas); cargarPronostico(); }));
$("historia").addEventListener("change", cargarPronostico);
$("confianza").addEventListener("change", cargarPronostico);
$("actualizar").addEventListener("click", cargarPronostico);
$("reintentar").addEventListener("click", () => { cargarSalud(); cargarPronostico(); });

cargarSalud();
cargarModelo();
cargarPronostico();
