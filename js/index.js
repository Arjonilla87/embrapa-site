// ============================
// ESTADO GLOBAL
// ============================

let tableHeaders = [];
let tableData = [];
let filteredData = [];

// A coluna OPÇÃO é SEMPRE a primeira (índice 0)
let optionColumnIndex = 0;

let currentSort = {
  columnIndex: null,
  direction: "asc"
};

// ============================
// INICIALIZAÇÃO SEGURA
// ============================

document.addEventListener("DOMContentLoaded", () => {
  loadCSV();
});

// ============================
// CARREGAMENTO DO CSV
// ============================

function loadCSV() {
  Papa.parse(`./data/opcao_status_summary.csv?v=${Date.now()}`, {
    download: true,
    encoding: "UTF-8",
    delimiter: ",",
    skipEmptyLines: true,

    complete: function (results) {
      let data = results.data.filter(r => Array.isArray(r) && r.length);

      if (!data.length) {
        console.error("CSV vazio");
        return;
      }

      // Linha LAST_UPDATE
      if (data[0][0] === "LAST_UPDATE") {
        document.getElementById("last-update").innerText =
          "Última atualização: " + data[0][1];
        data.shift();
      }

      tableHeaders = data.shift();
      tableData = data;

      filteredData = [...tableData];

      buildTableHeader();
      renderTableBody();
    },

    error: function (err) {
      console.error("Erro ao carregar CSV:", err);
    }
  });
}

// ============================
// HEADER
// ============================

function buildTableHeader() {
  const thead = document.querySelector("#data-table thead");
  thead.innerHTML = "";

  const tr = document.createElement("tr");

  tableHeaders.forEach((header, index) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.cursor = "pointer";

    th.addEventListener("click", () => handleSort(index));

    tr.appendChild(th);
  });

  thead.appendChild(tr);
}

// ============================
// ORDENAÇÃO
// ============================

function handleSort(columnIndex) {
  if (currentSort.columnIndex === columnIndex) {
    currentSort.direction =
      currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.columnIndex = columnIndex;
    currentSort.direction = "asc";
  }

  sortData();
  renderTableBody();
}

function sortData() {
  if (currentSort.columnIndex === null) return;

  const dir = currentSort.direction === "asc" ? 1 : -1;
  const col = currentSort.columnIndex;

  filteredData.sort((a, b) => {
    const v1 = String(a[col] ?? "");
    const v2 = String(b[col] ?? "");

    const n1 = parseFloat(v1.replace(",", "."));
    const n2 = parseFloat(v2.replace(",", "."));

    if (!isNaN(n1) && !isNaN(n2)) {
      return (n1 - n2) * dir;
    }

    return v1.localeCompare(v2, "pt-BR", { sensitivity: "base" }) * dir;
  });
}

// ============================
// RENDERIZAÇÃO
// ============================

function renderTableBody() {
  const tbody = document.querySelector("#data-table tbody");
  tbody.innerHTML = "";

  const percentColIndex = tableHeaders.findIndex(h => h.includes("%"));

  filteredData.forEach(row => {
    const tr = document.createElement("tr");

    row.forEach((cell, index) => {
      const td = document.createElement("td");
      td.setAttribute("data-label", tableHeaders[index]);

      if (index === percentColIndex) {
        const value = parseFloat(
          String(cell).replace("%", "").replace(",", ".")
        );

        if (!isNaN(value)) {
          const container = document.createElement("div");
          container.className = "progress-container";

          const bar = document.createElement("div");
          bar.className = "progress-bar";
          bar.style.width = Math.min(value, 100) + "%";
          bar.textContent = value.toFixed(1) + "%";

          if (value < 40) bar.classList.add("progress-low");
          else if (value < 80) bar.classList.add("progress-mid");
          else bar.classList.add("progress-high");

          container.appendChild(bar);
          td.appendChild(container);
        } else {
          td.textContent = cell;
        }
      } else {
        td.textContent = cell;
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  updateSortIcons();
}

// ============================
// ÍCONES ▲▼
// ============================

function updateSortIcons() {
  const ths = document.querySelectorAll("#data-table th");

  ths.forEach((th, index) => {
    th.textContent = tableHeaders[index];

    if (index === currentSort.columnIndex) {
      th.textContent +=
        currentSort.direction === "asc" ? " ▲" : " ▼";
    }
  });
}

// ============================
// FILTRO
// ============================

document.getElementById("search-input").addEventListener("input", function () {
  const query = this.value.trim().toLowerCase();

  filteredData = query
    ? tableData.filter(row =>
        String(row[optionColumnIndex] || "")
          .toLowerCase()
          .includes(query)
      )
    : [...tableData];

  sortData();
  renderTableBody();
});
