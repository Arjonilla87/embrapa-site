// ----------------------------------------
// Utilidades
// ----------------------------------------

function cacheBust(url) {
    return `${url}?v=${Date.now()}`;
}

async function loadJSON(url) {
    const res = await fetch(cacheBust(url));
    if (!res.ok) {
        throw new Error(`Erro ao carregar ${url}`);
    }
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

// 🔹 Lê LAST_UPDATE do arquivo GLOBAL (fonte única da verdade)
async function updateLastUpdate() {
    try {
        const raw = await fetch(
            cacheBust("data/opcao_status_summary.csv")
        ).then(r => r.text());

        const firstLine = raw.split("\n")[0].trim();
        const parts = firstLine.split(",");

        if (parts[0] === "LAST_UPDATE" && parts[1]) {
            document.getElementById("last-update").innerText =
                "Última checagem: " + parts[1].trim();
        } else {
            console.warn("LAST_UPDATE não encontrado na primeira linha");
        }
    } catch (e) {
        console.warn("Não foi possível atualizar LAST_UPDATE:", e);
    }
}

// ----------------------------------------
// Configuração de colunas
// ----------------------------------------

const VISIBLE_COLUMNS = [
    "DATA / HORA",
    "OPÇÃO",
    "NOME",
    "COLOCAÇÃO",
    "STATUS"
];

const HIDDEN_COLUMNS = [
    "UNIDADE",
    "LOTAÇÃO",
    "EVENTO",
    "ALTERACOES"
];

// cache correto dos blocos carregados
let loadedBlocks = [];

// ----------------------------------------
// Renderização
// ----------------------------------------

function applyStatusFilter() {
    const filter = document.getElementById("status-filter").value;
    const container = document.getElementById("diff-container");

    container.innerHTML = "";

    loadedBlocks.forEach(block => {
        const filteredRows =
            filter === "__ALL__"
                ? block.rows
                : block.rows.filter(r => (r.STATUS || "") === filter);

        if (filteredRows.length > 0) {
            renderTable(container, block.date, filteredRows);
        }
    });
}

function renderTable(container, title, rows) {
    if (!rows || rows.length === 0) return;

    const block = document.createElement("div");
    block.className = "diff-block";

    const h3 = document.createElement("div");
    h3.className = "diff-title";
    h3.textContent = `📅 ${title}`;
    block.appendChild(h3);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    const trHead = document.createElement("tr");
    VISIBLE_COLUMNS.forEach(col => {
        const th = document.createElement("th");
        th.textContent = col;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

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

    // ✅ Atualiza timestamp UMA ÚNICA VEZ (global)
    await updateLastUpdate();

    let index;

    try {
        index = await loadJSON("data/diff_index.json");
    } catch (e) {
        container.innerHTML = "❌ Erro ao carregar histórico";
        console.error(e);
        return;
    }

    const diffs = [...index.diffs].sort((a, b) =>
        b.date.localeCompare(a.date)
    );

    // opções do seletor
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
        const url = `data/diffs/${diff.file}`;
        container.innerHTML = "";

        const rows = await loadCSV(url);

        loadedBlocks = [{
            date: diff.date,
            rows: rows
        }];

        renderTable(container, diff.date, rows);
    }

    async function loadAll() {
        container.innerHTML = "";
        loadedBlocks = [];

        for (const diff of diffs) {
            const url = `data/diffs/${diff.file}`;
            const rows = await loadCSV(url);

            loadedBlocks.push({
                date: diff.date,
                rows: rows
            });
        }

        applyStatusFilter();
    }

    select.onchange = async () => {
        container.innerHTML = "⏳ Carregando...";
        loadedBlocks = [];

        if (select.value === "__ALL__") {
            await loadAll();
        } else {
            const diff = diffs.find(d => d.file === select.value);
            await loadSingle(diff);
            applyStatusFilter();
        }
    };

    statusFilter.onchange = applyStatusFilter;

    // 🔥 LOAD INICIAL — sempre data mais recente
    select.value = diffs[0].file;
    container.innerHTML = "⏳ Carregando...";
    loadedBlocks = [];

    await loadSingle(diffs[0]);
    applyStatusFilter();
}

document.addEventListener("DOMContentLoaded", initHistory);
