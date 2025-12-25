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

// ----------------------------------------
// Renderização
// ----------------------------------------

function renderTable(container, title, rows) {
    if (!rows || rows.length === 0) {
        return;
    }

    const block = document.createElement("div");
    block.className = "diff-block";

    const h3 = document.createElement("div");
    h3.className = "diff-title";
    h3.textContent = `📅 ${title}`;
    block.appendChild(h3);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    const headers = Object.keys(rows[0]);

    const trHead = document.createElement("tr");
    headers.forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    rows.forEach(row => {
        const tr = document.createElement("tr");
        const evento = (row.EVENTO || "").toLowerCase();
        if (["novo", "alterado", "removido"].includes(evento)) {
            tr.classList.add(evento);
        }

        headers.forEach(h => {
            const td = document.createElement("td");
            td.textContent = row[h] || "";
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
}

async function initHistory() {
    const select = document.getElementById("diff-select");
    const container = document.getElementById("diff-container");

    let index;

    try {
        index = await loadJSON("data/diff_index.json");
    } catch (e) {
        container.innerHTML = "❌ Erro ao carregar histórico";
        console.error(e);
        return;
    }

    if (!index.diffs || index.diffs.length === 0) {
        container.innerHTML = "📭 Nenhum histórico disponível";
        return;
    }

    // Ordena do mais recente para o mais antigo
    const diffs = [...index.diffs].sort((a, b) => b.date.localeCompare(a.date));

    // Opção TODOS
    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = "📚 Todos os dias";
    select.appendChild(optAll);

    // Datas individuais
    diffs.forEach(diff => {
        const opt = document.createElement("option");
        opt.value = diff.file;
        opt.textContent = `${diff.date} (${diff.events} eventos)`;
        select.appendChild(opt);
    });

    async function loadSingle(diff) {
        const rows = await loadCSV(`data/diffs/${diff.file}`);
        renderTable(container, diff.date, rows);
    }

    async function loadAll() {
        container.innerHTML = "";
        for (const diff of diffs) {
            await loadSingle(diff);
        }
    }

    select.onchange = async () => {
        container.innerHTML = "⏳ Carregando...";

        if (select.value === "__ALL__") {
            await loadAll();
        } else {
            const diff = diffs.find(d => d.file === select.value);
            container.innerHTML = "";
            await loadSingle(diff);
        }
    };

    // 🔥 Carrega automaticamente o mais recente
    select.value = diffs[0].file;
    container.innerHTML = "";
    await loadSingle(diffs[0]);
}

// ----------------------------------------
// Start
// ----------------------------------------

document.addEventListener("DOMContentLoaded", initHistory);
