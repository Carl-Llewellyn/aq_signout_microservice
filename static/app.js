document.addEventListener('DOMContentLoaded', function() {
  // Define your columns, in order, as used by your backend
  const columns = [
    "aq", "signout_name", "prog_id", "migratory_group", "cruise_id", "comments",
    "sample_types", "trip", "trip_location", "mgl_lead", "mgl_samplers", "chief_scientist",
    "target", "comments_collection_method", "vial_series", "comments_vial_series",
    "start_date", "end_date", "date_added", "date_updated", "chief_scientist_id"
  ];

  const columnTypes = {
    aq: "string",
    signout_name: "string",
    prog_id: "int",
    migratory_group: "string",
    cruise_id: "string",
    comments: "string",
    sample_types: "string",
    trip: "string",
    trip_location: "string",
    mgl_lead: "string",
    mgl_samplers: "string",
    chief_scientist: "string",
    target: "string",
    comments_collection_method: "string",
    vial_series: "string",
    comments_vial_series: "string",
    start_date: "date",
    end_date: "date",
    date_added: "date",
    date_updated: "date",
    chief_scientist_id: "int64"
  };

  function normalizeAQRow(row) {
    const out = {};
    for (const key in row) {
      let val = row[key];
      switch (columnTypes[key]) {
        case "int":
        case "int64":
          if (val === "" || val == null) {
            out[key] = null;
          } else {
            const num = Number(val);
            out[key] = isNaN(num) ? null : num;
          }
          break;
        case "date":
          out[key] = val ? new Date(val).toISOString() : null;
          break;
        default:
          out[key] = val === "" ? null : val;
      }
    }
    return out;
  }

  let aqs = [];
  let editing = {};
  let adding = null;
  let page = 0;
  let pageSize = 20;
  let lastSearch = '';
  let isLastPage = false;

  function toDateInput(val) {
    if (!val) return "";
    if (typeof val === "string") return val.slice(0, 10);
    try {
      return new Date(val).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }

  function jsonFetch(url, opts = {}) {
    return fetch(url, opts).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    });
  }

  function jsonSend(url, data, method = "POST") {
    return fetch(url, {
      method: method,
      body: JSON.stringify(normalizeAQRow(data)),
      headers: { "Content-Type": "application/json" }
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r;
    });
  }

  function renderPagination() {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = page === 0;
    prevBtn.onclick = () => { if (page > 0) { page--; fetchAqs(); } };
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.disabled = isLastPage;
    nextBtn.onclick = () => { if (!isLastPage) { page++; fetchAqs(); } };
    const info = document.createElement('span');
    info.textContent = ` Page ${page + 1} `;
    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
  }

  function renderTable() {
    const table = document.getElementById("aq-table");
    table.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      trh.appendChild(th);
    });
    trh.appendChild(document.createElement("th")); // Save/Discard
    trh.appendChild(document.createElement("th")); // Delete
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    (aqs || []).forEach(row => {
      const tr = document.createElement("tr");
      const isEditing = editing[row.aq];

      columns.forEach(col => {
        const td = document.createElement("td");
        if (isEditing && col !== "aq") {
          const inp = document.createElement("input");
          if (col.endsWith("_date") || col === "date_added" || col === "date_updated") {
            inp.type = "date";
            inp.value = toDateInput(row[col]);
          } else if (columnTypes[col] === "int" || columnTypes[col] === "int64") {
            inp.type = "number";
            inp.value = row[col] ?? "";
          } else {
            inp.type = "text";
            inp.value = row[col] ?? "";
          }
          inp.oninput = e => { row[col] = inp.value; };
          td.appendChild(inp);
        } else {
          td.textContent =
            (col.endsWith("_date") || col === "date_added" || col === "date_updated")
              ? toDateInput(row[col])
              : (row[col] ?? "");
        }
        tr.appendChild(td);
      });

      const tdSave = document.createElement("td");
      if (isEditing) {
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.className = "save";
        saveBtn.onclick = () => onSave(row);
        const discBtn = document.createElement("button");
        discBtn.textContent = "Discard";
        discBtn.className = "discard";
        discBtn.onclick = () => onDiscard(row);
        tdSave.appendChild(saveBtn);
        tdSave.appendChild(discBtn);
      } else {
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.className = "save";
        editBtn.onclick = () => {
          editing = {};
          editing[row.aq] = true;
          renderTable();
        };
        tdSave.appendChild(editBtn);
      }
      tr.appendChild(tdSave);

      const tdDel = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "delete";
      delBtn.onclick = () => onDelete(row);
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });

    // Row for adding
    if (adding) {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        if (col.endsWith("_date") || col === "date_added" || col === "date_updated") {
          inp.type = "date";
          inp.value = toDateInput(adding[col]);
        } else if (columnTypes[col] === "int" || columnTypes[col] === "int64") {
          inp.type = "number";
          inp.value = adding[col] ?? "";
        } else {
          inp.type = "text";
          inp.value = adding[col] ?? "";
        }
        inp.oninput = e => { adding[col] = inp.value; };
        td.appendChild(inp);
        tr.appendChild(td);
      });
      const tdSave = document.createElement("td");
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Add";
      saveBtn.className = "save";
      saveBtn.onclick = onAddSave;
      const discBtn = document.createElement("button");
      discBtn.textContent = "Discard";
      discBtn.className = "discard";
      discBtn.onclick = onAddDiscard;
      tdSave.appendChild(saveBtn);
      tdSave.appendChild(discBtn);
      tr.appendChild(tdSave);
      tr.appendChild(document.createElement("td")); // Empty for delete column
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    renderPagination();
  }

  function fetchAqs() {
    const search = document.getElementById("search").value.trim();
    lastSearch = search;
    const url = `/aq/list?limit=${pageSize}&offset=${page * pageSize}` + (search ? "&aq=" + encodeURIComponent(search) : "");
    jsonFetch(url)
      .then((data) => {
        aqs = data;
        isLastPage = data.length < pageSize;
        renderTable();
      })
      .catch((e) => alert("Fetch failed: " + e));
  }

  function onSave(row) {
    editing = {};
    jsonSend("/aq/update", row, "POST")
      .then(() => fetchAqs())
      .catch(e => alert("Save failed: " + e));
  }

  function onDiscard(row) {
    editing = {};
    fetchAqs();
  }

  function onDelete(row) {
    if (!confirm("Delete this row?")) return;
    fetch(`/aq/delete?aq=${encodeURIComponent(row.aq)}`, { method: "POST" })
      .then(() => fetchAqs())
      .catch(e => alert("Delete failed: " + e));
  }

  function onAddRow() {
    if (adding) return;
    adding = {};
    columns.forEach(c => { adding[c] = ""; });
    renderTable();
  }

  function onAddSave() {
    jsonSend("/aq/create", adding, "POST")
      .then(() => {
        adding = null;
        fetchAqs();
      })
      .catch(e => alert("Add failed: " + e));
  }

  function onAddDiscard() {
    adding = null;
    renderTable();
  }

  // Setup toolbar and table
  document.getElementById("add-row").onclick = onAddRow;
  document.getElementById("search").oninput = function() {
    page = 0;
    fetchAqs();
  };

  let pagDiv = document.getElementById('pagination');
  if (!pagDiv) {
    pagDiv = document.createElement('div');
    pagDiv.id = 'pagination';
    pagDiv.style = 'margin: 1em 0;';
    document.querySelector('.container').appendChild(pagDiv);
  }

  fetchAqs();
});