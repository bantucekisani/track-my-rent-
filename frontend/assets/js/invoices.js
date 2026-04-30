function notify(message, type = "info") {
  if (window.showToast) {
    window.showToast(message, type);
    return;
  }

  window.alert(message);
}

function confirmAction(message) {
  return window.confirm(message);
}
/* ==========================================================
   INVOICES MODULE (PRODUCTION VERSION)
========================================================== */

let allInvoices = [];
let currentFilter = "ALL";
let searchTerm = "";

/* ==========================================================
   INIT
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

  const user = JSON.parse(localStorage.getItem("user"));

  if (!user?.token) {
    window.location.href = "login.html";
    return;
  }

  await loadInvoices();

  bindFilterButtons();
  bindSearch();
  initInvoicesTutorial();

});


/* ==========================================================
   LOAD INVOICES
========================================================== */

async function loadInvoices(){

  const user = JSON.parse(localStorage.getItem("user"));

  try{

    const res = await fetch(`${API_URL}/invoices`,{
      headers:{
        Authorization:`Bearer ${user.token}`
      }
    });

    if(!res.ok) throw new Error("Invoice load failed");

    const data = await res.json();

    /* GLOBAL CURRENCY SETTINGS */
    window.APP_CURRENCY = data.currency || "ZAR";
    window.APP_LOCALE = data.locale || "en-ZA";

    allInvoices = data.invoices || [];

    renderInvoices();

  }
  catch(err){

    console.error("INVOICE LOAD ERROR:",err);

    document.getElementById("invoiceTableBody").innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">
          Failed to load invoices
        </td>
      </tr>
    `;

  }

}


/* ==========================================================
   RENDER INVOICES
========================================================== */

function renderInvoices(){

  const tbody = document.getElementById("invoiceTableBody");

  tbody.innerHTML = "";

  const now = new Date();

  const filtered = allInvoices.filter(inv=>{

    const balance = toNumber(inv.ledgerBalance);

    /* STATUS FILTER */

    if(currentFilter==="PAID" && inv.ledgerStatus!=="PAID") return false;

    if(currentFilter==="UNPAID" && inv.ledgerStatus!=="UNPAID") return false;

    if(currentFilter==="OVERDUE"){

      if(
        balance<=0 ||
        !inv.dueDate ||
        new Date(inv.dueDate)>=now
      ) return false;

    }

    /* SEARCH FILTER */

    if(searchTerm){

      const invoiceMatch =
        inv.invoiceNumber?.toLowerCase().includes(searchTerm);

      const tenantMatch =
        inv.tenantId?.fullName?.toLowerCase().includes(searchTerm);

      if(!invoiceMatch && !tenantMatch) return false;

    }

    return true;

  });

  if(!filtered.length){

    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">
          <div style="padding:18px 8px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">No invoices found.</div>
            <div style="color:#64748b; margin-bottom:12px;">Invoices will appear here after you create leases and generate billing documents.</div>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <button class="btn-secondary btn-sm" onclick="window.location.href='leases.html'">Go to Leases</button>
              <button class="btn-secondary btn-sm" onclick="window.location.href='tutorials.html'">Open Tutorials</button>
            </div>
          </div>
        </td>
      </tr>
    `;

    return;

  }

  /* SORT NEWEST FIRST */

  filtered.sort((a,b)=>
    new Date(b.invoiceDate) - new Date(a.invoiceDate)
  );

  filtered.forEach(inv=>{

    const row = document.createElement("tr");

    const charged = toNumber(inv.ledgerCharged);
    const paid = toNumber(inv.ledgerPaid);
    const balance = toNumber(inv.ledgerBalance);

    const isOverdue =
      balance>0 &&
      inv.dueDate &&
      new Date(inv.dueDate) < now;

    if(isOverdue){
      row.classList.add("invoice-overdue");
    }

    row.innerHTML = `
      <td>${safe(inv.invoiceNumber)}</td>

      <td>${safe(inv.tenantId?.fullName)}</td>

      <td>${formatDate(inv.invoiceDate)}</td>

      <td>${formatDate(inv.dueDate)}</td>

      <td>${statusBadge(inv.ledgerStatus)}</td>

      <td>${money(charged)}</td>

      <td>${money(paid)}</td>

      <td><strong>${money(balance)}</strong></td>

      <td>

        <button class="btn-small"
          onclick="viewInvoice('${inv._id}')">
          PDF
        </button>

        <button class="btn-small"
          onclick="emailInvoice('${inv._id}')">
          Email
        </button>

      </td>
    `;

    tbody.appendChild(row);

  });

}


/* ==========================================================
   FILTER BUTTONS
========================================================== */

function bindFilterButtons(){

  document.querySelectorAll(".filter-btn").forEach(btn=>{

    btn.addEventListener("click",()=>{

      document.querySelectorAll(".filter-btn")
        .forEach(b=>b.classList.remove("active"));

      btn.classList.add("active");

      currentFilter = btn.dataset.filter;

      renderInvoices();

    });

  });

}


/* ==========================================================
   SEARCH
========================================================== */

function bindSearch(){

  const input = document.getElementById("invoiceSearch");

  if(!input) return;

  input.addEventListener("input",e=>{

    searchTerm = e.target.value.toLowerCase().trim();

    renderInvoices();

  });

}

function initInvoicesTutorial() {
  if (!window.TutorialRegistry) {
    return;
  }

  window.TutorialRegistry.initPageTutorial("invoices", "startTutorialBtn");
}


/* ==========================================================
   HELPERS
========================================================== */

function formatDate(date){

  if(!date) return "-";

  return new Date(date).toLocaleDateString(
    window.APP_LOCALE || "en-ZA",
    {
      day:"2-digit",
      month:"short",
      year:"numeric"
    }
  );

}


/* GLOBAL MONEY FORMATTER */

function money(value){

  const amount = toNumber(value);

  return new Intl.NumberFormat(
    window.APP_LOCALE || "en-ZA",
    {
      style:"currency",
      currency: window.APP_CURRENCY || "ZAR",
      minimumFractionDigits:2
    }
  ).format(amount);

}


/* SAFE NUMBER PARSER */

function toNumber(value){

  if(value===null || value===undefined) return 0;

  if(typeof value==="string"){
    value = value.replace(/[^\d.-]/g,"");
  }

  const num = parseFloat(value);

  return isNaN(num) ? 0 : num;

}


function safe(value){
  return value || "-";
}


function statusBadge(status){

  if(status==="PAID")
    return `<span class="badge badge-paid">PAID</span>`;

  if(status==="PARTIAL")
    return `<span class="badge badge-partial">PARTIAL</span>`;

  return `<span class="badge badge-unpaid">UNPAID</span>`;

}


/* ==========================================================
   VIEW INVOICE PDF
========================================================== */

async function viewInvoice(invoiceId){

  const user = JSON.parse(localStorage.getItem("user"));

  if(!user?.token){
    notify("Session expired");
    return;
  }

  try{

    const res = await fetch(
      `${API_URL}/invoices/${invoiceId}/pdf`,
      {
        headers:{
          Authorization:`Bearer ${user.token}`
        }
      }
    );

    if(!res.ok){

      const text = await res.text();
      console.error("PDF ERROR:",text);

      notify("Failed to generate PDF");
      return;

    }

    const blob = await res.blob();

    if (blob.type !== "application/pdf") {
      notify("Server did not return a PDF");
      return;
    }

    const url = URL.createObjectURL(blob);

    window.open(url, "_blank");

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);

  }
  catch(err){

    console.error("PDF ERROR:",err);
    notify("PDF failed");

  }

}


/* ==========================================================
   EMAIL INVOICE
========================================================== */

async function emailInvoice(invoiceId){

  const user = JSON.parse(localStorage.getItem("user"));

  if(!user?.token){
    notify("Session expired");
    return;
  }

  try{

    const res = await fetch(
      `${API_URL}/invoices/${invoiceId}/email`,
      {
        method:"POST",
        headers:{
          Authorization:`Bearer ${user.token}`
        }
      }
    );

    const data = await res.json();

    notify(data.message || "Invoice emailed successfully");

  }
  catch(err){

    console.error("EMAIL ERROR:",err);

    notify("Failed to email invoice");

  }

}


