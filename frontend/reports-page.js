// Reports page (reports.html): every submitted report, with a status filter.
import { fetchReports } from "./reports.js";
import { byId, initShell, createReportCard, setBusy, setMessage, errorMessage } from "./shared.js";

const list = byId("reportsList");
const message = byId("reportsMessage");
const count = byId("reportsCount");
const refreshBtn = byId("refreshBtn");
const statusFilter = byId("statusFilter");

let allReports = [];
let loadToken = 0;

initShell(() => {});
refreshBtn.addEventListener("click", loadReports);
statusFilter.addEventListener("change", render);
loadReports();

async function loadReports() {
  const token = ++loadToken;
  setBusy(refreshBtn, true, "Refreshing…");
  setMessage(message, "Loading reports…", "");
  try {
    const reports = await fetchReports();
    if (token !== loadToken) return;
    allReports = reports;
    render();
  } catch (error) {
    if (token !== loadToken) return;
    console.error("Could not load reports.", error);
    setMessage(message, errorMessage(error, "Reports could not be loaded."), "error");
  } finally {
    if (token === loadToken) setBusy(refreshBtn, false);
  }
}

function render() {
  const wanted = statusFilter.value;
  const shown = wanted ? allReports.filter((report) => report.status === wanted) : allReports;

  list.replaceChildren();
  const fragment = document.createDocumentFragment();
  shown.forEach((report) => fragment.append(createReportCard(report)));
  list.append(fragment);

  count.textContent = allReports.length
    ? `Showing ${shown.length} of ${allReports.length} report${allReports.length === 1 ? "" : "s"}`
    : "";
  if (!allReports.length) setMessage(message, "No hazard reports yet. Log in and use Report to add the first one.", "");
  else if (!shown.length) setMessage(message, `No ${wanted} reports right now.`, "");
  else setMessage(message, "", "");
}
