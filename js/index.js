// ----------------------------------------
// Utilidades
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

// 🔹 Lê LAST_UPDATE do arquivo GLOBAL
async function updateLastUpdate() {
    try {
        const raw = await fetch(
            cacheBust("data/opcao_status_summary.csv")
        ).then(r => r.text());

        const [key, value] = raw.split("\n")[0].split(",");
        if (key === "LAST_UPDATE" && value) {
            document.getElementById("last-update").innerText =
                "Última checagem: " + value.trim();
        }
    } catch (e) {
        console.warn("Não foi possível atualizar LAST_UPDATE:", e);
    }
}

// ----------------------------------------
// Configuração
// ----------------------------------------

const VISIBLE_COLUMNS = [
    "DATA / HORA",
    "OPÇÃO",
    "CARGO",
    "SUBÁREA",
    "LOTAÇÃO",        //<--------------
    "NOME",
    "COLOCAÇÃO",
    "STATUS"
];

const HIDDEN_COLUMNS = [
    "UNIDADE",
    
    "EVENTO",
    "ALTERACOES"
];

let loadedBlocks = [];

// ----------------------------------------
// Lógica de filtro (STATUS + EVENTO)
// ----------------------------------------

function matchesStatusFilter(row, filter) {
    const status = (row.STATUS || "").trim();
    const evento = (row.EVENTO || "").trim().toUpperCase();

    if (filter === "__ALL__") return true;

    if (filter === "CONVOCADO_NOVO") {
        return status === "Convocado" && evento === "NOVO";
    }

    if (filter === "CONVOCADO_ALTERADO") {
        return status === "Convocado" && evento !== "NOVO";
    }

    return status === filter;
}

// ----------------------------------------
// Renderização
// ----------------------------------------

function applyStatusFilter() {
    const filter = document.getElementById("status-filter").value;
    const container = document.getElementById("diff-container");

    container.innerHTML = "";

    loadedBlocks.forEach(block => {
        const rows = block.rows.filter(r =>
            matchesStatusFilter(r, filter)
        );

        if (rows.length > 0) {
            renderTable(container, block.date, rows);
        }
    });
}

function renderTable(container, title, rows) {
    const block = document.createElement("div");
    block.className = "diff-block";

    const h3 = document.createElement("div");
    h3.className = "diff-title";
    h3.textContent = `📅 ${title}`;
    block.appendChild(h3);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Cabeçalho
    const trHead = document.createElement("tr");
    VISIBLE_COLUMNS.forEach(col => {
        const th = document.createElement("th");
        th.textContent = col;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    // Linhas
    rows.forEach(row => {
        const tr = document.createElement("tr");
        tr.classList.add("expandable");

        const evento = (row.EVENTO || "").toLowerCase();
        if (["novo", "alterado", "removido"].includes(evento)) {
            tr.classList.add(evento);
        }

        VISIBLE_COLUMNS.forEach(col => {
            const td = document.createElement("td");
            td.textContent = row[col] || "";
            td.setAttribute("data-label", col);
            tr.appendChild(td);
        });

        // Linha expandida (detalhes)
        const detailsTr = document.createElement("tr");
        detailsTr.className = "details-row";
        detailsTr.style.display = "none";

        const detailsTd = document.createElement("td");
        detailsTd.colSpan = VISIBLE_COLUMNS.length;

        const grid = document.createElement("div");
        grid.className = "details-grid";

        HIDDEN_COLUMNS.forEach(col => {
            if (row[col]) {
                const div = document.createElement("div");

                if (col.toLowerCase().includes("alterac")) {
                    div.classList.add("alteracoes");
                }

                div.innerHTML = `<strong>${col}:</strong> ${row[col]}`;
                grid.appendChild(div);
            }
        });

        detailsTd.appendChild(grid);
        detailsTr.appendChild(detailsTd);

        tr.addEventListener("click", () => {
            detailsTr.style.display =
                detailsTr.style.display === "none" ? "table-row" : "none";
        });

        tbody.appendChild(tr);
        tbody.appendChild(detailsTr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
}

// ----------------------------------------
// Init
// ----------------------------------------

async function initHistory() {
    const select = document.getElementById("diff-select");
    const statusFilter = document.getElementById("status-filter");
    const container = document.getElementById("diff-container");

    await updateLastUpdate();

    const index = await loadJSON("data/diff_index.json");
    const diffs = [...index.diffs].sort((a, b) =>
        b.date.localeCompare(a.date)
    );

    select.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = "📚 Todos os dias";
    select.appendChild(optAll);

    diffs.forEach(diff => {
        const opt = document.createElement("option");
        opt.value = diff.file;
        opt.textContent = `${diff.date} (${diff.events} eventos)`;
        select.appendChild(opt);
    });

    async function loadSingle(diff) {
        const rows = await loadCSV(`data/diffs/${diff.file}`);
        loadedBlocks = [{ date: diff.date, rows }];
    }

    // 🔥 Load inicial
    select.value = diffs[0].file;
    container.innerHTML = "⏳ Carregando...";
    await loadSingle(diffs[0]);

    // 🔥 Auto filtro inteligente
    const rows = loadedBlocks[0].rows;

    const hasNovo = rows.some(r =>
        r.STATUS === "Convocado" &&
        (r.EVENTO || "").toUpperCase() === "NOVO"
    );

    const hasAlterado = rows.some(r =>
        r.STATUS === "Convocado" &&
        (r.EVENTO || "").toUpperCase() !== "NOVO"
    );

    if (hasNovo) {
        statusFilter.value = "CONVOCADO_NOVO";
    } else if (hasAlterado) {
        statusFilter.value = "CONVOCADO_ALTERADO";
    } else {
        statusFilter.value = "__ALL__";
    }

    applyStatusFilter();

    select.onchange = async () => {
        container.innerHTML = "⏳ Carregando...";

        if (select.value === "__ALL__") {
            loadedBlocks = [];

            for (const diff of diffs) {
                const rows = await loadCSV(`data/diffs/${diff.file}`);
                loadedBlocks.push({ date: diff.date, rows });
            }
        } else {
            const diff = diffs.find(d => d.file === select.value);
            await loadSingle(diff);
        }

        applyStatusFilter();
    };

    statusFilter.onchange = applyStatusFilter;
}

document.addEventListener("DOMContentLoaded", initHistory);

// ============================
// Contador de visualizações
// ============================
// ============================
// Contador de visualizações
// ============================

async function updateViewCounter() {

    const workerURL = "https://embrapa-counter.arjonilla-lf.workers.dev/?page=index";

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
