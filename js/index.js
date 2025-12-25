// ============================
// CARREGAMENTO DO CSV (ANTI-CACHE)
// ============================

fetch("/embrapa-site/data/latest_version.txt")
  .then(r => r.text())
  .then(version => {
    const v = version.trim();
    const csvUrl = `/embrapa-site/data/opcao_status_summary_${v}.csv`;

    Papa.parse(csvUrl, {
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
  })
  .catch(err => {
    console.error("Erro ao obter versão do CSV:", err);
  });
