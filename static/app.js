document.addEventListener('DOMContentLoaded', function() {
  const msgpack = window.msgpack;

  // Define your columns, in order, as used by your backend
  const columns = [
    "aq", "signout_name", "prog_id", "migratory_group", "cruise_id", "comments",
    "sample_types", "trip", "trip_location", "mgl_lead", "mgl_samplers", "chief_scientist",
    "target", "comments_collection_method", "vial_series", "comments_vial_series",
    "start_date", "end_date", "date_added", "date_updated", "chief_scientist_id"
  ];

  let aqs = [];
  let editing = {};
  let adding = null;
  let page = 0;
  let pageSize = 50;
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

  function fromDateInput(val) {
    if (!val) return null;
    try {
      return new Date(val).toISOString();
    } catch {
      return null;
    }
  }

  function msgpackFetch(url, opts = {}) {
    return fetch(url, opts).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      const buf = await r.arrayBuffer();
      return msgpack.decode(new Uint8Array(buf));
    });
  }

  function msgpackSend(url, data, method = "POST") {
    return fetch(url, {
      method: method,
      body: msgpack.encode(data),
      headers: { "Content-Type": "application/x-msgpack" }
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
    // Header
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      trh.appendChild(th);
    });
    // Extra action columns
    trh.appendChild(document.createElement("th")); // Save/Discard
    trh.appendChild(document.createElement("th")); // Delete
    thead.appendChild(trh);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    (aqs || []).forEach(row => {
      const tr = document.createElement("tr");
      const isEditing = editing[row.aq];

      columns.forEach(col => {
        const td = document.createElement("td");
        if (isEditing && col !== "aq") {
          // Editable
          const inp = document.createElement(
            col.endsWith("_date") || col === "date_added" || col === "date_updated"
              ? "input"
              : "input"
          );
          if (col.endsWith("_date") || col === "date_added" || col === "date_updated") {
            inp.type = "date";
            inp.value = toDateInput(row[col]);
          } else {
            inp.type = "text";
            inp.value = row[col] ?? "";
          }
          inp.oninput = e => { row[col] = inp.value; };
          td.appendChild(inp);
        } else {
          // Non-editable or primary key
          td.textContent =
            (col.endsWith("_date") || col === "date_added" || col === "date_updated")
              ? toDateInput(row[col])
              : (row[col] ?? "");
        }
        tr.appendChild(td);
      });

      // Save/Discard
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

      // Delete
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
        const inp = document.createElement(
          col.endsWith("_date") || col === "date_added" || col === "date_updated"
            ? "input"
            : "input"
        );
        if (col.endsWith("_date") || col === "date_added" || col === "date_updated") {
          inp.type = "date";
          inp.value = toDateInput(adding[col]);
        } else {
          inp.type = "text";
          inp.value = adding[col] ?? "";
        }
        inp.oninput = e => { adding[col] = inp.value; };
        td.appendChild(inp);
        tr.appendChild(td);
      });
      // Save/Discard buttons
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
    msgpackFetch(url)
      .then((data) => {
        aqs = data;
        isLastPage = data.length < pageSize;
        renderTable();
      })
      .catch((e) => alert("Fetch failed: " + e));
  }

  function onSave(row) {
    editing = {};
    msgpackSend("/aq/update", row, "POST")
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
    msgpackSend("/aq/create", adding, "POST")
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

  // Add pagination container if not present
  let pagDiv = document.getElementById('pagination');
  if (!pagDiv) {
    pagDiv = document.createElement('div');
    pagDiv.id = 'pagination';
    pagDiv.style = 'margin: 1em 0;';
    document.querySelector('.container').appendChild(pagDiv);
  }

  // Initial fetch
  fetchAqs();
});