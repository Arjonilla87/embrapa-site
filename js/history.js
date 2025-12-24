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
            complete: results => resolve(results),
            error: err => reject(err)
        });
    });
}

// ----------------------------------------
// Renderização
// ----------------------------------------

async function initHistory() {
    const select = document.getElementById("diff-select");
    const table = document.getElementById("diff-table");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    let index;

    try {
        index = await loadJSON("data/diff_index.json");
    } catch (e) {
        tbody.innerHTML = `<tr><td>❌ Erro ao carregar histórico</td></tr>`;
        console.error(e);
        return;
    }

    if (!index.diffs || index.diffs.length === 0) {
        tbody.innerHTML = `<tr><td>📭 Nenhum diff disponível</td></tr>`;
        return;
    }

    // Preenche o select
    index.diffs.forEach(diff => {
        const opt = document.createElement("option");
        opt.value = diff.file;
        opt.textContent = `${diff.date} (${diff.events} eventos)`;
        select.appendChild(opt);
    });

    select.onchange = async () => {
        const file = select.value;
        if (!file) return;

        thead.innerHTML = "";
        tbody.innerHTML = `<tr><td>⏳ Carregando...</td></tr>`;

        try {
            const parsed = await loadCSV(`data/diffs/${file}`);
            const rows = parsed.data;

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td>📭 Nenhum dado</td></tr>`;
                return;
            }

            const headers = Object.keys(rows[0]);

            // Cabeçalho
            const trHead = document.createElement("tr");
            headers.forEach(h => {
                const th = document.createElement("th");
                th.textContent = h;
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);

            // Corpo
            tbody.innerHTML = "";

            rows.forEach(row => {
                const tr = document.createElement("tr");

                const evento = (row.EVENTO || "").toLowerCase();
                if (["novo", "removido", "alterado"].includes(evento)) {
                    tr.classList.add(evento);
                }

                headers.forEach(h => {
                    const td = document.createElement("td");
                    td.textContent = row[h] || "";
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });

        } catch (e) {
            tbody.innerHTML = `<tr><td>❌ Erro ao carregar CSV</td></tr>`;
            console.error(e);
        }
    };
}

// ----------------------------------------
// Start
// ----------------------------------------

document.addEventListener("DOMContentLoaded", initHistory);
