// ----------------------------------------
// REGISTRO GLOBAL CHART.JS (v3 + v4 SAFE)
// ----------------------------------------

if (Chart.register) {

    // v4
    if (Chart.registerables) {
        Chart.register(...Chart.registerables);
    }

    // v3 fallback
    else if (Chart.defaults) {
        Chart.register(
            Chart.CategoryScale,
            Chart.LinearScale,
            Chart.TimeScale,
            Chart.BarController,
            Chart.LineController,
            Chart.PointElement,
            Chart.BarElement,
            Chart.LineElement,
            Chart.Tooltip,
            Chart.Legend
        );
    }
}

// DataLabels
if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
}

// ----------------------------------------
// Utilitários
// ----------------------------------------
function cacheBust(url) {
    return `${url}?v=${Date.now()}`;
}

async function loadJSON(url) {
    const res = await fetch(cacheBust(url));
    if (!res.ok) throw new Error(`Erro ao carregar ${url}`);
    return await res.json();
}

function loadCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(cacheBust(url), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: results => resolve(results.data),
            error: err => reject(err)
        });
    });
}

function renderTabela({
    data,
    tbodyId,
    colunas,
    colspan,
    ordenar,
    crescente
}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!data.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${colspan}" style="text-align:center">
            Nenhum registro
        </td>`;
        tbody.appendChild(tr);
        return;
    }
    if (ordenar == true){
        ordenarTabela(data, crescente);
    }

    data.forEach(row => {
        const tr = document.createElement("tr");

        tr.innerHTML = colunas
            .map(col => `<td>${row[col] ?? ""}</td>`)
            .join("");

        tbody.appendChild(tr);
    });
}

function ordenarTabela(data, crescente = true) {

    function formatarData(valor) {
        return valor && valor.trim() !== ""
            ? valor.trim()
            : "Indeterminado";
    }

    function parseData(valor) {

        if (!valor || valor === "Indeterminado") {
            return -Infinity; // mais antiga possível
        }

        const [y, m, d] = valor.split("-").map(Number);

        if (!y || !m || !d) {
            return -Infinity;
        }

        return new Date(y, m - 1, d).getTime();
    }

    // normaliza DATA antes de ordenar
    data.forEach(item => {
        item["DATA"] = formatarData(item["DATA"]);
    });

    return data.sort((a, b) => {

        const dateA = parseData(a["DATA"]);
        const dateB = parseData(b["DATA"]);

        // 1️⃣ Ordenação por DATA
        if (dateA !== dateB) {
            return crescente
                ? dateA - dateB
                : dateB - dateA;
        }

        // 2️⃣ DATA igual → CARGO
        const cargoCmp = (a["CARGO"] || "").localeCompare(
            b["CARGO"] || "",
            "pt-BR",
            { sensitivity: "base" }
        );

        if (cargoCmp !== 0) return cargoCmp;

        // 3️⃣ DATA + CARGO iguais → NOME
        return (a["NOME"] || "").localeCompare(
            b["NOME"] || "",
            "pt-BR",
            { sensitivity: "base" }
        );
    });
}

// ----------------------------------------
// Variáveis globais
// ----------------------------------------
let velocityData = [];
let optionsData = [];
let cumulativeData = [];
let generalData = null;

let velocityChart = null;
let histogramChart = null;
let periodChart = null;
let monthlyChart = null;
let remainingDaysData = null;
let desistenciasChart = null;
let aceitesPendentesData = [];

// ----------------------------------------
// INIT
// ----------------------------------------
document.addEventListener("DOMContentLoaded", async () => {

    try {

        await loadGeneralStats();
        await loadVelocity();
        await loadRemainingDays();
        await loadOptionsHistogram();
        await loadCumulative();
        await loadMonthlyCumulative();

        // ==============================
        // DROPDOWN DO GRÁFICO VELOCITY
        // ==============================

        const velocitySelect = document.getElementById("velocityOptionSelect");

        if (velocitySelect) {

            // força estado inicial
            updateVelocityChart(velocitySelect.value);

            velocitySelect.addEventListener("change", e => {
                updateVelocityChart(e.target.value);
            });
        }

    } catch (e) {
        console.error("Erro ao inicializar dashboard:", e);
    }

});

// ----------------------------------------
// GENERAL BAR
// ----------------------------------------
async function loadGeneralStats() {

    generalData = await loadJSON("data/stats/general_stats.json");

    document.getElementById("last-update").innerText =
        "Última checagem: " + generalData.last_update;

    document.getElementById("kpi-days").innerText =
        generalData.business_days_elapsed;

    document.getElementById("kpi-convocados").innerText =
        generalData.total_convocados;

    document.getElementById("kpi-convocados-hoje").innerText =
        generalData.convocados_hoje ?? "--";

    document.getElementById("kpi-desistencias").innerText =
        generalData.pct_desistencias !== null && generalData.pct_desistencias !== undefined
            ? generalData.pct_desistencias.toFixed(1) + " %"
            : "--";

    document.getElementById("kpi-mm10").innerText =
        generalData.media_diaria_mm10 !== null &&
        generalData.media_diaria_mm10 !== undefined
            ? generalData.media_diaria_mm10
            : "--";

    document.getElementById("kpi-aceitou").innerText =
        generalData.total_aceitou;

    document.getElementById("kpi-contratados").innerText =
        generalData.total_contratados;

    // ============================
    // KPI - ACEITES PENDENTES
    // ============================

    try {
        const aceitesPendentesData = await loadCSV("data/stats/aceites_pendentes.csv");

        document.getElementById("kpi-aceites-pendentes").innerText =
            aceitesPendentesData.length;
    } catch (e) {
        console.error("Erro ao carregar aceites pendentes:", e);
        document.getElementById("kpi-aceites-pendentes").innerText = "0";
    }
}

// ----------------------------------------
// VELOCITY (Convocados + MM5/MM10)
// ----------------------------------------
async function loadVelocity() {

    velocityData = await loadCSV("data/stats/velocity_daily.csv");

    velocityData = velocityData.filter(r => r.date && r.date.trim() !== "");

    updateVelocityChart("ALL");
}

function updateVelocityChart(group = "ALL") {

    // 🔤 Meses em português (escopo local)
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const dates = velocityData.map(r => {
        const [y, m, d] = r.date.split("-");
        return new Date(y, m - 1, d);
    });

    const convocados = velocityData.map(r =>
        r[`convocados_${group}`] ? parseInt(r[`convocados_${group}`]) : 0
    );

    const mm5 = velocityData.map(r =>
        r[`mm5_${group}`] ? parseInt(r[`mm5_${group}`]) : null
    );

    const mm10 = velocityData.map(r =>
        r[`mm10_${group}`] ? parseInt(r[`mm10_${group}`]) : null
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const firstDate = dates[0];

    const convocadosSeries = dates.map((d, i) => ({
        x: d,
        y: convocados[i]
    }));

    const mm5Series = dates.map((d, i) => ({
        x: d,
        y: mm5[i]
    }));

    const mm10Series = dates.map((d, i) => ({
        x: d,
        y: mm10[i]
    }));

    if (velocityChart) velocityChart.destroy();

    const ctx = document.getElementById("velocityChart").getContext("2d");

    velocityChart = new Chart(ctx, {
        type: "line",
        data: {
            datasets: [

                // ======================
                // CONVOCADOS → SOMENTE PONTOS
                // ======================
                {
                    label: "Convocados (dia)",
                    type: "scatter",
                    data: convocadosSeries,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    backgroundColor: "#90e0ef",
                    borderColor: "#0077b6",
                    showLine: false
                },

                // ======================
                // MM5 → LINHA + PONTOS
                // ======================
                {
                    label: "MM5",
                    data: mm5Series,
                    borderColor: "#00c04b",
                    backgroundColor: "#00c04b",
                    tension: 0.3,
                    spanGaps: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },

                // ======================
                // MM10 → LINHA + PONTOS
                // ======================
                {
                    label: "MM10",
                    data: mm10Series,
                    borderColor: "#006d2c",
                    backgroundColor: "#006d2c",
                    tension: 0.3,
                    spanGaps: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    position: "bottom"
                },
                tooltip: {
                    enabled: true
                },
                datalabels: {
                    display: false
                }
            },

            scales: {

                x: {
                    type: "time",
                    suggestedMin: firstDate,
                    suggestedMax: today,

                    time: {
                        unit: "day",
                        tooltipFormat: "dd/MM/yyyy"
                    },

                    title: {
                        display: true,
                        text: "Dia",
                        color: "#000000",
                        font: {
                            size: 14,
                            weight: "bold"
                        }
                    },

                    ticks: {
                        color: "#000000",
                        font: {
                            size: 14
                        },
                        callback: function(value) {
                            const d = new Date(value);
                            const day = String(d.getDate()).padStart(2, "0");
                            const month = monthNames[d.getMonth()];
                            return `${month} ${day} `;
                        }
                    }
                },

                y: {
                    beginAtZero: true,

                    title: {
                        display: true,
                        text: "Convocados",
                        color: "#000000",
                        font: {
                            size: 14,
                            weight: "bold"
                        }
                    },

                    ticks: {
                        precision: 0,
                        color: "#000000",
                        font: {
                            size: 14
                        }
                    }
                }
            }
        }
    });
}

// ----------------------------------------
// CUMULATIVE
// ----------------------------------------
async function loadCumulative() {

    cumulativeData = await loadJSON("data/stats/cumulative_stats.json");

    if (!cumulativeData.weekly?.convocado) return;

    const data = cumulativeData.weekly.convocado;

    const labels = data.map((d, i) =>
        i === data.length - 1 ? "Semana atual" : formatWeekLabel(d.label)
    );

    const values = data.map(d => parseInt(d.value, 10));

    if (periodChart) periodChart.destroy();

    const ctx = document.getElementById("periodChart").getContext("2d");

    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = 6;
    patternCanvas.height = 6;

    const pctx = patternCanvas.getContext("2d");
    pctx.strokeStyle = "#1b5e20";
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 6);
    pctx.lineTo(6, 0);
    pctx.stroke();

    const pattern = ctx.createPattern(patternCanvas, "repeat");

    periodChart = new Chart(ctx, {

        type: "bar",

        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: pattern,
                borderColor: "#000000",
                borderWidth: 1
            }]
        },

        options: {

            responsive: true,

            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                datalabels: {
                    anchor: "end",
                    align: "end",
                    color: "#000000"
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: "#000000",
                        font: {
                            size: 10 // ← tamanho menor para os rótulos
                        }
                    },
                    title: {
                        display: true,
                        text: "Semana",
                        color: "#000000",
                        font: {
                            size: 12,  // mantém maior para o título
                            weight: "bold"
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: Math.ceil((Math.max(...values) * 1.12) / 5) * 5,    //aumenta a escala em 12% e arredonda os ticks para multiplos de 5.
                    ticks: {
                        stepSize: 5,
                        color: "#000000",
                        font: {
                            size: 10
                        }
                    },
                    title: {
                        display: true,
                        text: "Convocações",
                        color: "#000000",
                        font: {
                            size: 12,
                            weight: "bold"
                        }
                    }
                }
            }
        }
    });
}

// ----------------------------------------
// CUMULATIVO MENSAL (Contratados)
// ----------------------------------------
async function loadMonthlyCumulative() {

    const cumulativeData = await loadJSON("data/stats/cumulative_stats.json");

    if (!cumulativeData.monthly_contratados?.contratados) return;

    const data = cumulativeData.monthly_contratados.contratados;

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // Renomeia o último label como "Mês atual"
    const labels = data.map((d, i) => {
        if (i === data.length - 1) return "Mês atual";

        let monthIndex, yearShort;

        if (d.label.includes("/")) {
            // formato MM/YY
            const [mm, yy] = d.label.split("/");
            monthIndex = parseInt(mm, 10) - 1;
            yearShort = yy;
        } else if (d.label.includes("-")) {
            // formato YYYY-MM
            const [yyyy, mm] = d.label.split("-");
            monthIndex = parseInt(mm, 10) - 1;
            yearShort = yyyy.slice(-2);
        } else {
            // fallback
            monthIndex = 0;
            yearShort = "??";
        }

        const monthName = monthNames[monthIndex];
        return `${monthName}_${yearShort}`;
    });

    const values = data.map(d => parseInt(d.value, 10));

    if (monthlyChart) monthlyChart.destroy();

    const ctx = document.getElementById("monthlyChart").getContext("2d");

    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = 6;
    patternCanvas.height = 6;

    const pctx = patternCanvas.getContext("2d");
    pctx.strokeStyle = "#1b5e20";
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 6);
    pctx.lineTo(6, 0);
    pctx.stroke();

    const pattern = ctx.createPattern(patternCanvas, "repeat");

    monthlyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: pattern,
                borderColor: "#000000",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                datalabels: {
                    anchor: "end",
                    align: "end",
                    color: "#000000"
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: "#000000",
                        font: { size: 10 } // rótulos menores
                    },
                    title: {
                        display: true,
                        text: "Mês",
                        color: "#000000",
                        font: { size: 12, weight: "bold" }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#000000",
                        font: { size: 10 } // rótulos menores
                    },
                    title: {
                        display: true,
                        text: "Contratações",
                        color: "#000000",
                        font: { size: 12, weight: "bold" }
                    }
                }
            }
        }
    });
}

// ----------------------------------------
// HISTOGRAM
// ----------------------------------------
async function loadOptionsHistogram() {

    optionsData = await loadJSON("data/stats/options_distribution.json");

    renderHistogram();
}

function renderHistogram() {

    const labels = optionsData.buckets.map(b => b.range);
    const values = optionsData.buckets.map(b => b.count);

    if (histogramChart) histogramChart.destroy();

    const ctx = document.getElementById("optionsHistogram").getContext("2d");

    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = 6;
    patternCanvas.height = 6;

    const pctx = patternCanvas.getContext("2d");
    pctx.strokeStyle = "#1b5e20";
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 6);
    pctx.lineTo(6, 0);
    pctx.stroke();

    const pattern = ctx.createPattern(patternCanvas, "repeat");

    // calcula o valor máximo e adiciona 10% de folga
    const maxValue = Math.max(...values);
    const suggestedMax = maxValue + maxValue * 0.1; // 10% a mais

    histogramChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: pattern,
                borderColor: "#000000",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                datalabels: {
                    anchor: "end",
                    align: "end",
                    clamp: true,
                    color: "#000000"
                }
            },
            scales: {
                x: {
                    ticks: { color: "#000000" },
                    title: {
                        display: true,
                        text: "Vagas",
                        color: "#000000",
                        font: { weight: "bold" }
                    }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: suggestedMax,
                    ticks: {
                        color: "#000000",
                        stepSize: 2    // <-- força ticks de 2 em 2
                    },
                    title: {
                        display: true,
                        text: "Qt. de opções",
                        color: "#000000",
                        font: { weight: "bold" }
                    }
                }
            }
        }
    });
}

// =====================================
// CONTRATADOS POR CARGO
// =====================================
let contratadosPorCargoData = [];
let contratadosPorCargoChart = null;

async function loadContratadosPorCargo() {
    try {
        const res = await fetch("data/stats/percent_contratado.csv");
        const text = await res.text();

        const lines = text.split("\n").filter(l => l.trim() !== "");
        const headers = lines[0].split(",");

        contratadosPorCargoData = lines.slice(1).map(line => {
            const values = line.split(",");
            const obj = {};
            headers.forEach((h, i) => {
                obj[h.trim()] = values[i].trim();
            });
            return obj;
        });

        renderContratadosPorCargoChart();

        // atualiza ao mudar o select
        const select = document.getElementById("contratadosViewSelect");
        select.addEventListener("change", () => renderContratadosPorCargoChart());

    } catch (e) {
        console.error("Erro ao carregar percent_contratado.csv:", e);
    }
}

function renderContratadosPorCargoChart() {
    const select = document.getElementById("contratadosViewSelect");
    const view = select.value; // "percent" ou "absolute"

    const labels = contratadosPorCargoData.map(d => d.Cargo);

    if (contratadosPorCargoChart) contratadosPorCargoChart.destroy();

    const ctx = document.getElementById("contratadosPorCargoChart").getContext("2d");

    if (view === "absolute") {
        // BARRAS HORIZONTAIS EMPILHADAS
        const datasets = [
            {
                label: "Contratados",
                data: contratadosPorCargoData.map(d => Number(d.Contratados)),
                backgroundColor: "#1b5e20"
            },
            {
                label: "Em Contratação",
                data: contratadosPorCargoData.map(d => Number(d["Em Contratação"])),
                backgroundColor: "#4caf50"
            },
            {
                label: "Vagas abertas",
                data: contratadosPorCargoData.map(d => Number(d["Vagas abertas"])),
                backgroundColor: "#c8e6c9"
            }
        ];

        contratadosPorCargoChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets
            },
            options: {
                indexAxis: 'y', // horizontal
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',       // mantém no topo
                        align: 'start',        // todas na mesma linha, sem quebrar
                        labels: {
                            boxWidth: 20,      // tamanho da caixinha de cor
                            padding: 10,       // espaçamento entre legendas
                            color: "#000000",  // cor do texto
                            font: {
                                size: 10       // tamanho da fonte
                            }
                        },
                        fullSize: false        // evita que o container da legenda ocupe toda a largura
                    },
                    tooltip: { enabled: false, mode: 'index', intersect: false },
                    datalabels: {
                        color: "#000000",   // rótulos pretos
                        anchor: "center",
                        align: "center",
                        formatter: (value) => value
                    }
                },
                scales: {
                    x: {
                        stacked: true,  // habilita empilhamento horizontal
                        beginAtZero: true,
                        ticks: { display: false, stepSize: 1 },
                        grid: { display: false },
                        max: 450,
                    },
                    y: {
                        stacked: true,  // necessário para barras empilhadas corretamente
                        ticks: { color: "#000000" }
                    }
                }
            }
        });
    } else {
        // BARRAS DE PROGRESSO RELATIVAS (0-100%) COM TRANSPARÊNCIA
        const datasets = [
            {
                label: "% Contratado",
                data: contratadosPorCargoData.map(d => Number(d["% Contratado"])),
                backgroundColor: contratadosPorCargoData.map(d => {
                    const p = Number(d["% Contratado"]) / 100;
                    // cor verde (#1b5e20) com alpha proporcional ao percentual
                    return `rgba(0, 128, 0, ${Math.max(0.2, p)})`;
                    // mínimo 0.2 para barras muito pequenas
                })
            }
        ];

        contratadosPorCargoChart = new Chart(ctx, {
            type: "bar",
            data: { labels, datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        callbacks: { label: (context) => context.raw + "%" }
                    },
                    datalabels: {
                        anchor: 'center',
                        align: 'center',
                        color: '#000000',
                        font: { weight: 'normal' },
                        formatter: (value) => value + '%'
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: { display: false },
                        grid: { display: false }
                    },
                    y: { ticks: { color: "#000000" } }
                }
            },
            plugins: [ChartDataLabels] // ativa o plugin datalabels
        });
    }
}

// chama ao carregar a página
document.addEventListener("DOMContentLoaded", loadContratadosPorCargo);

// ----------------------------------------
// GRÁFICO DE DESISTÊNCIAS
// ----------------------------------------
async function loadDesistencias() {
    try {
        const res = await fetch('data/stats/desistencias.csv?v=' + Date.now());
        const text = await res.text();
        const rows = text.split('\n').filter(r => r.trim() !== '');
        const headers = rows.shift().split(',');

        const data = rows.map(r => {
            const cols = r.split(',');
            return {
                Cargo: cols[0],
                Desistências: Number(cols[1]),
                Convocações: Number(cols[2]),
                "% Desistências": Number(cols[3])
            };
        });

        renderDesistenciasChart(data);
    } catch (err) {
        console.error("Erro ao carregar desistências:", err);
    }
}

// chama quando a página carregar
document.addEventListener("DOMContentLoaded", loadDesistencias);

function renderDesistenciasChart(desistenciasData) {
    const labels = desistenciasData.map(d => d.Cargo);

    if (desistenciasChart) desistenciasChart.destroy();

    const ctx = document.getElementById("desistenciasChart").getContext("2d");

    const datasets = [
        {
            label: "Desistências",
            data: desistenciasData.map(d => Number(d.Desistências)),
            backgroundColor: "#1b5e20", // vermelho
        },
        {
            label: "Convocações",
            data: desistenciasData.map(d => Number(d.Convocações)),
            backgroundColor: "#4caf50" // verde claro (barra de fundo)
        }
    ];

    desistenciasChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets },
        options: {
            indexAxis: 'y',  // barras horizontais
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: "#000000", font: { size: 12 } }
                },
                datalabels: {
                    color: "#000000",
                    font: { size: 10, weight: "normal" },
                    anchor: "end",
                    align: "end",
                    formatter: (value, context) => {
                        const datasetIndex = context.datasetIndex;

                        // Dataset 0 = Desistências → mostrar "valor (percent%)"
                        if (datasetIndex === 0) {
                            const total = context.chart.data.datasets[1].data[context.dataIndex];
                            const pct = total ? (value / total * 100).toFixed(1) : 0;
                            return `${value} (${pct}%)`;
                        }

                        // Dataset 1 = Convocações → mostrar valor absoluto
                        if (datasetIndex === 1) {
                            return value;
                        }

                        return value; // fallback
                    }
                }
            },
            scales: {
                x: {
                    display: false,  // esconde a escala e grid
                    max: Math.max(...datasets[1].data) * 1.12  // aumenta 12% sobre o valor máximo de "Convocações"
                },
                y: {
                    ticks: { color: "#000000" },
                    grid: { display: false }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

// ----------------------------------------
// WEEK FORMAT (segunda → domingo)
// ----------------------------------------
function formatWeekLabel(isoLabel) {

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                        "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const [yearStr, weekStr] = isoLabel.split("-W");

    const year = parseInt(yearStr, 10);
    const isoWeek = parseInt(weekStr, 10);

    const today = new Date();

    // ============================
    // ISO Monday (of week)
    // ============================

    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;

    const monday = new Date(jan4);
    monday.setUTCDate(
        jan4.getUTCDate() - (jan4Day - 1) + (isoWeek - 1) * 7
    );

    // ============================
    // ISO Sunday
    // ============================

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const mondayMonth = monday.getUTCMonth();
    const sundayMonth = sunday.getUTCMonth();

    let referenceDate;

    // ============================
    // Semana cruza mês?
    // ============================

    if (mondayMonth !== sundayMonth) {

        const lastDayOfOldMonth = new Date(Date.UTC(
            monday.getUTCFullYear(),
            mondayMonth + 1,
            0
        ));

        // Enquanto ainda estamos no mês antigo → mantém mês antigo
        if (today <= lastDayOfOldMonth) {
            referenceDate = lastDayOfOldMonth;
        } else {
            referenceDate = monday; // nova semana pertence ao novo mês
        }

    } else {
        referenceDate = monday;
    }

    // ============================
    // Conta SEGUNDAS do mês
    // ============================

    const monthIndex = referenceDate.getUTCMonth();
    const yearRef = referenceDate.getUTCFullYear();

    const firstDayOfMonth = new Date(Date.UTC(yearRef, monthIndex, 1));
    const firstMonday = new Date(firstDayOfMonth);

    const dow = firstMonday.getUTCDay() || 7;
    firstMonday.setUTCDate(firstMonday.getUTCDate() + (8 - dow) % 7);

    const diffMs = referenceDate - firstMonday;

    const weekNumber =
        Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

    const monthName = monthNames[monthIndex];
    const yearShort = String(yearRef).slice(-2);

    return `${monthName}_${yearShort}_S${weekNumber}`;
}

// ----------------------------------------
// MODAL DETALHES
// ----------------------------------------

function openDetails(type) {

    const overlay = document.getElementById("details-overlay");
    const title = document.getElementById("details-title");

    // Esconde todos os painéis internos
    document.querySelectorAll("#details-content > div").forEach(div => {
        div.style.display = "none";
    });

    overlay.style.display = "flex";

    // ===============================
    // VELOCITY
    // ===============================

    if (type === "velocity") {
        document.getElementById("velocity-details").style.display = "block";
        renderVelocityTable();
    }

    // ===============================
    // Convocados(Semanal)
    // ===============================

    if (type === "convocados_sem") {
        document.getElementById("convocados-semanal-details").style.display = "block";
        loadConvocadosSemanal();
    }

    // ===============================
    // Contratados(Mês)
    // ===============================

    if (type === "contratados_mes") {
        document.getElementById("contratados-mensal-details").style.display = "block";
        loadContratadosMensal();
    }

    // ===============================
    // HISTOGRAMA VAGAS
    // ===============================

    if (type === "histograma") {
        document.getElementById("histograma-details").style.display = "block";
        loadOptionsDistribution();
    }

    // ===============================
    // Aceites pendentes
    // ===============================

    if (type === "aceites_pendentes") {
        document.getElementById("aceites-details").style.display = "block";
        loadAceitesPendentes();
    }
    // ===============================
    // Contratações em curso
    // ===============================

    if (type === "contratando") {
        document.getElementById("contratando-details").style.display = "block";
        loadContratando();
    }
    // ===============================
    // Contratados
    // ===============================

    if (type === "contratados") {
        document.getElementById("contratados-mensal-details").style.display = "block";
        loadContratadosMensal();
    }

}

function closeDetails(event) {

    if (event && event.target.id !== "details-overlay") return;

    document.getElementById("details-overlay").style.display = "none";
}

// ----------------------------------------
// MODAL VELOCITY
// ----------------------------------------
async function loadRemainingDays() {

    const rows = await loadCSV("data/stats/remaining_days.csv");

    remainingDaysData = {};

    rows.forEach(r => {

        if (!r.CARGO) return;

        remainingDaysData[r.CARGO] = {

            remaining_vacancies: parseInt(r.REMAINING_VACANCIES) || 0,
            mm5: parseInt(r.MM5) || null,
            mm10: parseInt(r.MM10) || null,
            days_mm5: parseInt(r.DAYS_MM5) || null,
            days_mm10: parseInt(r.DAYS_MM10) || null
        };

    });

}

function renderVelocityTable() {

    if (!remainingDaysData) return;

    const tbody = document.getElementById("velocityTableBody");
    tbody.innerHTML = "";

    // ==========================
    // SEM FILTRO → SEMPRE "ALL"
    // Primeira entrada do JSON
    // ==========================

    const keys = Object.keys(remainingDaysData);

    if (!keys.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3">Dados indisponíveis</td>
            </tr>
        `;
        return;
    }

    const data = remainingDaysData[keys[0]];

    if (!data) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3">Dados indisponíveis</td>
            </tr>
        `;
        return;
    }

    // ==========================
    // RENDER DAS DUAS MÉTRICAS
    // ==========================

    const rows = [
        {
            vagas: data.remaining_vacancies,
            media: data.mm5,
            dias: data.days_mm5
        },
        {
            vagas: data.remaining_vacancies,
            media: data.mm10,
            dias: data.days_mm10
        }
    ];

    rows.forEach(row => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.vagas}</td>
            <td>${row.media}</td>
            <td>${row.dias}</td>
        `;

        tbody.appendChild(tr);
    });
}


// ----------------------------------------
// MODAL CONVOCADOS SEMANAL
// ----------------------------------------

async function loadConvocadosSemanal() {

    const response = await fetch('data/stats/convocados_semanal_detalhes.csv?v=' + Date.now());
    const csvText = await response.text();

    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');

    const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
        return obj;
    });

    // ==========================
    // Agrupa WEEK_LABEL usando WEEK_ISO como chave técnica
    // ==========================

    const weekMap = new Map();

    data.forEach(row => {
        const iso = row.WEEK_ISO;
        const label = row.WEEK_LABEL;

        if (!weekMap.has(iso)) {
            weekMap.set(iso, label);
        }
    });

    // ==========================
    // Ordena da MAIS RECENTE → MAIS ANTIGA
    // ==========================

    const sortedWeeks = [...weekMap.entries()]
        .sort((a, b) => {
            const [yearA, weekA] = a[0].split('-W').map(Number);
            const [yearB, weekB] = b[0].split('-W').map(Number);

            if (yearA !== yearB) return yearB - yearA;
            return weekB - weekA;
        });

    // ==========================
    // Preenche SELECT
    // ==========================

    const select = document.getElementById('convocWeekSelect');
    select.innerHTML = '';

    sortedWeeks.forEach(([iso, label]) => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        select.appendChild(option);
    });

    // ==========================
    // Listener
    // ==========================

    select.addEventListener('change', () => {
        updateConvocadosTable(data, select.value);
    });

    // ==========================
    // Auto carrega semana MAIS RECENTE
    // ==========================

    if (sortedWeeks.length > 0) {
        const latestLabel = sortedWeeks[0][1];
        select.value = latestLabel;
        updateConvocadosTable(data, latestLabel);
    }
}

function updateConvocadosTable(data, weekLabel) {
    const tbody = document.getElementById('convocadosTableBody');
    tbody.innerHTML = ''; // limpa

    const filtered = data.filter(d => d.WEEK_LABEL === weekLabel);

    filtered.forEach(row => {
        const tr = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = extractISODate(row['DATE']);
        tr.appendChild(dateCell);

        const opcaoCell = document.createElement('td');
        opcaoCell.textContent = row['OPÇÃO'] || '';
        tr.appendChild(opcaoCell);

        const cargoCell = document.createElement('td');
        cargoCell.textContent = row['CARGO'] || '';
        tr.appendChild(cargoCell);

        const nomeCell = document.createElement('td');
        nomeCell.textContent = row['NOME'] || '';
        tr.appendChild(nomeCell);

        tbody.appendChild(tr);
    });
}

// Chama ao carregar a página
document.addEventListener('DOMContentLoaded', loadConvocadosSemanal);

// ----------------------------------------
// MODAL CONTRATADOS MENSAL
// ----------------------------------------

async function loadContratadosMensal() {

    const response = await fetch('data/stats/contratados_mensal_detalhes.csv?v=' + Date.now());
    const csvText = await response.text();

    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');

    const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
        return obj;
    });

    // ==========================
    // Agrupa MONTH_LABEL usando MONTH_ISO
    // ==========================

    const monthMap = new Map();

    data.forEach(row => {
        const iso = row.MONTH_ISO;
        const label = row.MONTH_LABEL;

        if (!monthMap.has(iso)) {
            monthMap.set(iso, label);
        }
    });

    // ==========================
    // Ordena MAIS RECENTE → MAIS ANTIGO
    // ==========================

    const sortedMonths = [...monthMap.entries()]
        .sort((a, b) => {
            const [yearA, monthA] = a[0].split('-').map(Number);
            const [yearB, monthB] = b[0].split('-').map(Number);

            if (yearA !== yearB) return yearB - yearA;
            return monthB - monthA;
        });

    // ==========================
    // Preenche SELECT
    // ==========================

    const select = document.getElementById('contratMonthSelect');
    select.innerHTML = '';

    sortedMonths.forEach(([iso, label]) => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        select.appendChild(option);
    });

    // ==========================
    // Listener
    // ==========================

    select.addEventListener('change', () => {
        updateContratadosTable(data, select.value);
    });

    // ==========================
    // Auto carrega mês MAIS RECENTE
    // ==========================

    if (sortedMonths.length > 0) {
        const latestLabel = sortedMonths[0][1];
        select.value = latestLabel;
        updateContratadosTable(data, latestLabel);
    }
}

function updateContratadosTable(data, monthLabel) {

    const tbody = document.getElementById('contratadosTableBody');
    tbody.innerHTML = '';

    const filtered = data.filter(d => d.MONTH_LABEL === monthLabel);

    filtered.forEach(row => {

        const tr = document.createElement('tr');

        // DATA (YYYY-MM-DD)
        const dateCell = document.createElement('td');
        dateCell.textContent = extractISODate(row['DATE']);
        tr.appendChild(dateCell);

        // OPÇÃO
        const opcaoCell = document.createElement('td');
        opcaoCell.textContent = row['OPÇÃO'] || '';
        tr.appendChild(opcaoCell);

        // CARGO
        const cargoCell = document.createElement('td');
        cargoCell.textContent = row['CARGO'] || '';
        tr.appendChild(cargoCell);

        // NOME
        const nomeCell = document.createElement('td');
        nomeCell.textContent = row['NOME'] || '';
        tr.appendChild(nomeCell);

        tbody.appendChild(tr);
    });
}

// Chama ao carregar página
document.addEventListener('DOMContentLoaded', loadContratadosMensal);

function extractISODate(dateStr) {
    if (!dateStr) return '';

    // Extrai apenas YYYY-MM-DD (antes do espaço ou 'T')
    return dateStr.split(/[ T]/)[0];
}

// ----------------------------------------
// HISTOGRAMA DE OPÇÕES / MODAL
// ----------------------------------------

async function loadOptionsDistribution() {
    try {
        optionsData = await loadJSON("data/stats/options_distribution.json"); // seu JSON
        populateBucketSelect();
        // inicializa tabela com o primeiro bucket, se existir
        if (optionsData.buckets?.length) {
            updateOptionsTable(optionsData.buckets[0].range);
        }
    } catch (e) {
        console.error("Erro ao carregar opções:", e);
    }
}

function populateBucketSelect() {
    const select = document.getElementById("bucketSelect");
    if (!select) return;

    select.innerHTML = ""; // limpa

    optionsData.buckets.forEach(bucket => {
        const option = document.createElement("option");
        option.value = bucket.range;
        option.textContent = `${bucket.range} (${bucket.count})`;
        select.appendChild(option);
    });

    // Atualiza tabela ao mudar o select
    select.addEventListener("change", () => {
        updateOptionsTable(select.value);
    });
}

function updateOptionsTable(selectedBucket) {
    const tbody = document.getElementById("optionsHistogramTableBody");
    if (!tbody || !optionsData.details) return;

    tbody.innerHTML = ""; // limpa

    // filtra pelo bucket selecionado
    let filtered = optionsData.details.filter(d => d.bucket === selectedBucket);

    // ======================
    // Ordena do maior para o menor vagas_abertas
    // Caso empate, ordena por cargo e depois subárea
    // ======================
    filtered.sort((a, b) => {
        const vagasA = parseInt(a.vagas_abertas) || 0;
        const vagasB = parseInt(b.vagas_abertas) || 0;

        if (vagasB !== vagasA) return vagasB - vagasA; // decrescente

        // desempate por cargo (alfabético)
        const cargoA = (a.cargo || "").toLowerCase();
        const cargoB = (b.cargo || "").toLowerCase();
        if (cargoA !== cargoB) return cargoA.localeCompare(cargoB);

        // desempate por subarea (alfabético)
        const subA = (a.subarea || "").toLowerCase();
        const subB = (b.subarea || "").toLowerCase();
        return subA.localeCompare(subB);
    });

    if (filtered.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" style="text-align:center">Nenhum registro</td>`;
        tbody.appendChild(tr);
        return;
    }

    filtered.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.opcao}</td>
            <td>${row.cargo}</td>
            <td>${row.subarea}</td>
            <td>${row.vagas_abertas}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Chama o loader ao iniciar a página
document.addEventListener("DOMContentLoaded", loadOptionsDistribution);

// ============================
// ACEITES PENDENTES - MODAL
// ============================
async function loadAceitesPendentes() {
    try {
        aceitesPendentesData = await loadCSV("data/stats/aceites_pendentes.csv");

        // 🔧 Ajuste visual da DATA: YYYY-MM-DD → DD/MM/YY
        aceitesPendentesData = aceitesPendentesData.map(row => {
            const raw = row["DATA"];

            if (!raw || raw.trim() === "") {
                return { ...row, DATA: "" };
            }

            const [y, m, d] = raw.split("-");

            return {
                ...row,
                DATA: (y && m && d)
                    ? `${d}/${m}/${y.slice(-2)}`
                    : raw
            };
        });

        renderTabela({
            data: aceitesPendentesData,
            tbodyId: "aceitesPendentesTableBody",
            colunas: ["DATA", "OPÇÃO", "CARGO", "SUBÁREA", "NOME"],
            colspan: 5,
            ordenar: false,
            crescente: false
        });
    } catch (e) {
        console.error("Erro ao carregar aceites pendentes:", e);
    }
}

document.addEventListener("DOMContentLoaded", loadAceitesPendentes);

// ============================
// CONTRATAÇÕES EM CURSO - MODAL
// ============================
async function loadContratando() {
    try {
        const dadosCSV = await loadCSV(
            "data/stats/aceites_mensal_detalhes.csv"
        );

        const dadosRender = dadosCSV.map(row => ({
            ...row,
            DATA:
                row["DATA"] && row["DATA"].trim() !== ""
                    ? row["DATA"]
                    : "Anterior a 18/12/2025 (?)"
        }));

        renderTabela({
            data: dadosRender,
            tbodyId: "contratandoTableBody",
            colunas: ["DATA", "OPÇÃO", "CARGO", "SUBÁREA", "NOME", "UNIDADE"],
            colspan: 6,
            ordenar: true,
            crescente: true
        });

    } catch (e) {
        console.error(
            "Erro ao carregar aceites_mensal_detalhes.csv:",
            e
        );
    }
}
document.addEventListener("DOMContentLoaded", loadContratando);

// ============================
// Contador de visualizações
// ============================

async function updateViewCounter() {

    const workerURL = "https://embrapa-counter.arjonilla-lf.workers.dev/?page=estatisticas";

    try {

        const res = await fetch(workerURL, { cache: "no-store" });
        const data = await res.json();

        const el = document.getElementById("viewCounter");

        if (el && data.views !== undefined) {
            el.innerText = data.views;
        }

    } catch (err) {
        console.warn("Erro contador:", err);
    }
}

document.addEventListener("DOMContentLoaded", updateViewCounter);
