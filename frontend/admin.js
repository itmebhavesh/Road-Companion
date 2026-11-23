// Road Companion Admin Panel Controller
import { fetchReports } from "./reports.js";
import {
  getUserProfile,
  isAnyAdmin,
  ROLES,
  ROLE_LABELS,
  canManageCity,
  updateReportStatus,
  flagReport,
  fetchAuditLogs,
  listAllUsers,
  updateUserRole
} from "./admin-service.js";
import { GUJARAT_CITIES } from "./cities.js";
import {
  byId,
  initShell,
  formatWhen,
  STATUS_COLOR,
  statusSlug,
  setMessage,
  setBusy,
  errorMessage
} from "./shared.js";
import { filterReportsByTime, renderAnalyticsDashboard } from "./admin-analytics.js";

// DOM Elements
const checkingCard = byId("adminChecking");
const gateCard = byId("adminGate");
const gateTitle = byId("gateTitle");
const gateMessage = byId("gateMessage");
const gateActions = byId("gateActions");
const adminApp = byId("adminApp");

const adminRoleBadge = byId("adminRoleBadge");
const adminUserEmail = byId("adminUserEmail");
const adminCitiesWrap = byId("adminCitiesWrap");
const adminAssignedCities = byId("adminAssignedCities");
const adminRefreshBtn = byId("adminRefreshBtn");
const adminStatusMessage = byId("adminStatusMessage");

// Tabs
const tabReportsBtn = byId("tabReportsBtn");
const tabAnalyticsBtn = byId("tabAnalyticsBtn");
const tabAuditBtn = byId("tabAuditBtn");
const tabUsersBtn = byId("tabUsersBtn");

const sectionReports = byId("sectionReports");
const sectionAnalytics = byId("sectionAnalytics");
const sectionAudit = byId("sectionAudit");
const sectionUsers = byId("sectionUsers");

// Reports Tab Filters
const repSearchInput = byId("repSearchInput");
const repStatusFilter = byId("repStatusFilter");
const repCityFilter = byId("repCityFilter");
const repCategoryFilter = byId("repCategoryFilter");
const repFlagFilter = byId("repFlagFilter");
const reportsTableBody = byId("reportsTableBody");
const reportsTableCount = byId("reportsTableCount");

// Analytics Elements
const analyticsRangePills = document.querySelectorAll("#analyticsRangePills .filter-pill");
const customDateRow = byId("customDateRow");
const customStartDate = byId("customStartDate");
const customEndDate = byId("customEndDate");
const applyCustomDateBtn = byId("applyCustomDateBtn");
const anaStatEls = {
  total: byId("anaTotal"),
  Pending: byId("anaPending"),
  Verified: byId("anaVerified"),
  Progress: byId("anaProgress"),
  Resolved: byId("anaResolved")
};

// Audit Tab
const auditTableBody = byId("auditTableBody");

// Users Tab
const usersTableBody = byId("usersTableBody");
const assignRoleBtn = byId("assignRoleBtn");

// Modals
const statusModal = byId("statusModal");
const statusForm = byId("statusForm");
const statusReportTitle = byId("statusReportTitle");
const newStatusSelect = byId("newStatusSelect");
const statusNotes = byId("statusNotes");
const confirmResolutionCheck = byId("confirmResolutionCheck");
const cancelStatusBtn = byId("cancelStatusBtn");
const saveStatusBtn = byId("saveStatusBtn");
const statusModalMessage = byId("statusModalMessage");

const flagModal = byId("flagModal");
const flagForm = byId("flagForm");
const flagReportTitle = byId("flagReportTitle");
const flagDuplicate = byId("flagDuplicate");
const flagSuspicious = byId("flagSuspicious");
const flagInappropriate = byId("flagInappropriate");
const flagNotes = byId("flagNotes");
const cancelFlagBtn = byId("cancelFlagBtn");
const saveFlagBtn = byId("saveFlagBtn");
const flagModalMessage = byId("flagModalMessage");

const userModal = byId("userModal");
const userRoleForm = byId("userRoleForm");
const userModalUid = byId("userModalUid");
const userModalRole = byId("userModalRole");
const userModalCities = byId("userModalCities");
const userModalStatus = byId("userModalStatus");
const cancelUserBtn = byId("cancelUserBtn");
const saveUserBtn = byId("saveUserBtn");
const userModalMessage = byId("userModalMessage");

// Active state
let currentUser = null;
let currentProfile = null;
let allReports = [];
let scopedReports = [];
let activeAnalyticsRange = "7d";
let selectedReportForStatus = null;
let selectedReportForFlag = null;

init();

function init() {
  populateCityDropdowns();
  setupTabEvents();
  setupFilterEvents();
  setupModalEvents();

  adminRefreshBtn.addEventListener("click", () => reloadData());

  initShell(handleAuthChange);
}

function populateCityDropdowns() {
  GUJARAT_CITIES.forEach((c) => {
    // Report filter
    const optFilter = document.createElement("option");
    optFilter.value = c.name;
    optFilter.textContent = c.name;
    repCityFilter.appendChild(optFilter);

    // User modal cities
    const optUser = document.createElement("option");
    optUser.value = c.name;
    optUser.textContent = c.name;
    userModalCities.appendChild(optUser);
  });
}

async function handleAuthChange(user) {
  currentUser = user;

  if (!user) {
    checkingCard.hidden = true;
    adminApp.hidden = true;
    gateCard.hidden = false;
    gateTitle.textContent = "Sign In Required";
    gateMessage.textContent = "You must be signed in with an administrative account to access the Road Companion Admin Panel.";
    gateActions.querySelector("#gateLoginBtn").hidden = false;
    return;
  }

  checkingCard.hidden = false;
  adminApp.hidden = true;
  gateCard.hidden = true;

  try {
    currentProfile = await getUserProfile(user.uid);

    if (!isAnyAdmin(currentProfile)) {
      checkingCard.hidden = true;
      gateCard.hidden = false;
      gateTitle.textContent = "Access Denied: Standard Citizen Account";
      gateMessage.innerHTML = `Your account (<strong>${user.email}</strong>) is registered as a Citizen. Administrative access is restricted to verified Super Admins, City Admins, and Moderators.<br><br>If you are a municipal coordinator or team moderator, contact your platform Super Admin to assign your role.`;
      gateActions.querySelector("#gateLoginBtn").hidden = true;
      return;
    }

    // Access granted!
    checkingCard.hidden = true;
    gateCard.hidden = true;
    adminApp.hidden = false;

    renderAdminIdentity();
    await reloadData();
  } catch (error) {
    console.error("Auth check failed:", error);
    checkingCard.hidden = true;
    gateCard.hidden = false;
    gateTitle.textContent = "Authorization Check Error";
    gateMessage.textContent = error.message || "Failed to verify administrative permissions.";
  }
}

function renderAdminIdentity() {
  adminUserEmail.textContent = currentUser?.email || "Admin";
  adminRoleBadge.className = `role-badge role-${currentProfile.role}`;
  adminRoleBadge.textContent = ROLE_LABELS[currentProfile.role] || currentProfile.role;

  if (currentProfile.role === ROLES.CITY_ADMIN) {
    adminCitiesWrap.hidden = false;
    const cities = currentProfile.assignedCities?.length
      ? currentProfile.assignedCities.join(", ")
      : "All Gujarat Cities";
    adminAssignedCities.textContent = cities;
  } else {
    adminCitiesWrap.hidden = true;
  }

  // Super Admin view permissions
  if (currentProfile.role === ROLES.SUPER_ADMIN) {
    tabUsersBtn.hidden = false;
    tabAuditBtn.hidden = false;
  } else if (currentProfile.role === ROLES.CITY_ADMIN) {
    tabUsersBtn.hidden = true;
    tabAuditBtn.hidden = false;
  } else {
    // Moderator
    tabUsersBtn.hidden = true;
    tabAuditBtn.hidden = true;
  }
}

async function reloadData() {
  setMessage(adminStatusMessage, "Loading data from Firestore…", "");
  setBusy(adminRefreshBtn, true, "Loading…");

  try {
    allReports = await fetchReports();

    // Scope reports for City Admin
    if (currentProfile.role === ROLES.CITY_ADMIN && currentProfile.assignedCities?.length) {
      scopedReports = allReports.filter((r) =>
        currentProfile.assignedCities.includes(r.city)
      );
    } else {
      scopedReports = allReports;
    }

    renderReportsTable();
    updateAnalyticsTab();

    if (!tabAuditBtn.hidden && !sectionAudit.hidden) {
      await loadAuditLogs();
    }
    if (!tabUsersBtn.hidden && !sectionUsers.hidden) {
      await loadUsers();
    }

    setMessage(adminStatusMessage, "", "");
  } catch (err) {
    console.error(err);
    setMessage(adminStatusMessage, errorMessage(err, "Failed to load admin data."), "error");
  } finally {
    setBusy(adminRefreshBtn, false);
  }
}

// ---------------- TAB 1: Report Management ----------------

function renderReportsTable() {
  const query = repSearchInput.value.trim().toLowerCase();
  const statusFilter = repStatusFilter.value;
  const cityFilter = repCityFilter.value;
  const catFilter = repCategoryFilter.value;
  const flagFilter = repFlagFilter.value;

  const filtered = scopedReports.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (cityFilter && r.city !== cityFilter) return false;
    if (catFilter && r.category !== catFilter) return false;

    if (flagFilter === "flagged") {
      if (!r.flags?.duplicate && !r.flags?.suspicious && !r.flags?.inappropriate) return false;
    } else if (flagFilter === "duplicate" && !r.flags?.duplicate) return false;
    else if (flagFilter === "suspicious" && !r.flags?.suspicious) return false;
    else if (flagFilter === "inappropriate" && !r.flags?.inappropriate) return false;

    if (query) {
      const match = `${r.title} ${r.description} ${r.id} ${r.userId || ""}`.toLowerCase();
      if (!match.includes(query)) return false;
    }
    return true;
  });

  reportsTableBody.replaceChildren();

  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--muted); padding: 24px;">No matching reports found.</td>`;
    reportsTableBody.appendChild(tr);
    reportsTableCount.textContent = `Showing 0 of ${scopedReports.length} reports`;
    return;
  }

  filtered.forEach((report) => {
    const tr = document.createElement("tr");

    // Flags HTML
    let flagsHtml = "";
    if (report.flags?.duplicate) flagsHtml += `<span class="flag-badge flag-duplicate">Duplicate</span>`;
    if (report.flags?.suspicious) flagsHtml += `<span class="flag-badge flag-suspicious">Suspicious</span>`;
    if (report.flags?.inappropriate) flagsHtml += `<span class="flag-badge flag-inappropriate">Inappropriate</span>`;
    if (!flagsHtml) flagsHtml = `<span style="color:var(--muted); font-size:0.75rem;">None</span>`;

    // Action buttons depending on permissions
    const canUpdateStatus =
      currentProfile.role === ROLES.SUPER_ADMIN ||
      (currentProfile.role === ROLES.CITY_ADMIN && canManageCity(currentProfile, report.city)) ||
      (currentProfile.role === ROLES.MODERATOR && report.status !== "Resolved");

    tr.innerHTML = `
      <td style="white-space: nowrap; font-size:0.8rem; color:var(--muted);">${formatWhen(report.createdAt)}</td>
      <td>
        <strong style="color:#fff; display:block;">${escapeHtml(report.title)}</strong>
        <span style="font-size:0.8rem; color:var(--gold-light);">📍 ${report.city || "Gujarat"}</span>
      </td>
      <td>${escapeHtml(report.category)}</td>
      <td><span class="badge badge-${statusSlug(report.status)}">${report.status}</span></td>
      <td>${flagsHtml}</td>
      <td style="font-family: monospace; font-size: 0.76rem; color: var(--muted);">${report.userId ? report.userId.slice(0, 10) + "…" : "Anonymous"}</td>
      <td class="actions-cell">
        ${
          canUpdateStatus
            ? `<button class="btn btn-secondary btn-small update-status-btn" type="button" data-id="${report.id}">Status</button>`
            : ""
        }
        <button class="btn btn-secondary btn-small moderate-btn" type="button" data-id="${report.id}">Moderate</button>
        <a class="btn btn-secondary btn-small" href="index.html?report=${encodeURIComponent(report.id)}" target="_blank" title="View on Public Map">Map ↗</a>
      </td>
    `;

    tr.querySelector(".update-status-btn")?.addEventListener("click", () => openStatusModal(report));
    tr.querySelector(".moderate-btn")?.addEventListener("click", () => openFlagModal(report));

    reportsTableBody.appendChild(tr);
  });

  reportsTableCount.textContent = `Showing ${filtered.length} of ${scopedReports.length} reports`;
}

function openStatusModal(report) {
  selectedReportForStatus = report;
  statusReportTitle.textContent = `${report.title} (${report.city || "Gujarat"}) · Current: ${report.status}`;
  newStatusSelect.value = report.status;
  statusNotes.value = "";
  confirmResolutionCheck.checked = false;
  setMessage(statusModalMessage, "", "");
  statusModal.hidden = false;
  newStatusSelect.focus();
}

function openFlagModal(report) {
  selectedReportForFlag = report;
  flagReportTitle.textContent = `${report.title} (ID: ${report.id})`;
  flagDuplicate.checked = Boolean(report.flags?.duplicate);
  flagSuspicious.checked = Boolean(report.flags?.suspicious);
  flagInappropriate.checked = Boolean(report.flags?.inappropriate);
  flagNotes.value = report.moderationNotes || "";
  setMessage(flagModalMessage, "", "");
  flagModal.hidden = false;
}

// ---------------- TAB 2: Analytics ----------------

function updateAnalyticsTab() {
  const customStart = customStartDate.value;
  const customEnd = customEndDate.value;
  const filtered = filterReportsByTime(scopedReports, activeAnalyticsRange, customStart, customEnd);
  renderAnalyticsDashboard(filtered, anaStatEls);
}

// ---------------- TAB 3: Audit Logs ----------------

async function loadAuditLogs() {
  auditTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">Fetching audit trail…</td></tr>`;
  try {
    const logs = await fetchAuditLogs(100);
    auditTableBody.replaceChildren();

    if (!logs.length) {
      auditTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">No audit log records recorded yet.</td></tr>`;
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="white-space: nowrap; font-size:0.78rem; color:var(--muted);">${formatWhen(log.timestamp)}</td>
        <td><strong style="color:var(--gold-light);">${escapeHtml(log.action)}</strong></td>
        <td>
          <div style="font-size:0.82rem; color:#fff;">${escapeHtml(log.adminEmail || "Admin")}</div>
          <span class="role-badge role-${log.adminRole || "citizen"}" style="font-size:0.68rem; padding: 2px 6px;">${log.adminRole || "admin"}</span>
        </td>
        <td style="font-family: monospace; font-size: 0.78rem;">${escapeHtml(log.reportId || log.targetUserId || "—")}</td>
        <td>
          ${
            log.previousStatus && log.newStatus
              ? `<span class="badge badge-${statusSlug(log.previousStatus)}">${log.previousStatus}</span> → <span class="badge badge-${statusSlug(log.newStatus)}">${log.newStatus}</span>`
              : "—"
          }
        </td>
        <td style="font-size:0.82rem; color:#cbd5e1;">${escapeHtml(log.notes || "No notes provided.")}</td>
      `;
      auditTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Could not load audit logs:", error);
    auditTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f87171; padding: 20px;">${errorMessage(error, "Failed to load audit logs.")}</td></tr>`;
  }
}

// ---------------- TAB 4: User Management (Super Admin) ----------------

async function loadUsers() {
  usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">Loading users…</td></tr>`;
  try {
    const users = await listAllUsers();
    usersTableBody.replaceChildren();

    if (!users.length) {
      usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">No users currently stored in Firestore. Use "+ Assign / Edit Role" above to configure admin accounts.</td></tr>`;
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");
      const citiesText = u.assignedCities?.length ? u.assignedCities.join(", ") : "All / N/A";
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(u.id)}</td>
        <td><strong style="color:#fff;">${escapeHtml(u.email || "—")}</strong></td>
        <td><span class="role-badge role-${u.role || "citizen"}">${ROLE_LABELS[u.role] || u.role}</span></td>
        <td style="font-size: 0.82rem; color: var(--muted);">${escapeHtml(citiesText)}</td>
        <td><span style="color:${u.status === "active" ? "#4ade80" : "#f87171"}; font-weight:700;">${u.status || "active"}</span></td>
        <td>
          <button class="btn btn-secondary btn-small edit-user-btn" type="button">Edit</button>
        </td>
      `;

      tr.querySelector(".edit-user-btn").addEventListener("click", () => {
        openUserModal(u);
      });

      usersTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Could not load users:", error);
    usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f87171; padding: 20px;">${errorMessage(error, "Failed to load users.")}</td></tr>`;
  }
}

function openUserModal(userObj = null) {
  if (userObj) {
    userModalUid.value = userObj.id || "";
    userModalRole.value = userObj.role || "citizen";
    userModalStatus.value = userObj.status || "active";
    // Select cities
    const cities = userObj.assignedCities || [];
    Array.from(userModalCities.options).forEach((opt) => {
      opt.selected = cities.includes(opt.value);
    });
  } else {
    userModalUid.value = "";
    userModalRole.value = "city_admin";
    userModalStatus.value = "active";
    Array.from(userModalCities.options).forEach((opt) => (opt.selected = false));
  }
  setMessage(userModalMessage, "", "");
  userModal.hidden = false;
  userModalUid.focus();
}

// ---------------- Event Setup ----------------

function setupTabEvents() {
  const tabs = [
    { btn: tabReportsBtn, sec: sectionReports },
    { btn: tabAnalyticsBtn, sec: sectionAnalytics, onShow: updateAnalyticsTab },
    { btn: tabAuditBtn, sec: sectionAudit, onShow: loadAuditLogs },
    { btn: tabUsersBtn, sec: sectionUsers, onShow: loadUsers }
  ];

  tabs.forEach(({ btn, sec, onShow }) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.btn.classList.remove("active");
        t.btn.setAttribute("aria-selected", "false");
        t.sec.hidden = true;
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      sec.hidden = false;
      if (onShow) onShow();
    });
  });

  assignRoleBtn.addEventListener("click", () => openUserModal(null));
}

function setupFilterEvents() {
  [repSearchInput, repStatusFilter, repCityFilter, repCategoryFilter, repFlagFilter].forEach((el) => {
    el.addEventListener("input", renderReportsTable);
    el.addEventListener("change", renderReportsTable);
  });

  analyticsRangePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      analyticsRangePills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeAnalyticsRange = pill.dataset.range;
      customDateRow.style.display = activeAnalyticsRange === "custom" ? "flex" : "none";
      updateAnalyticsTab();
    });
  });

  applyCustomDateBtn.addEventListener("click", updateAnalyticsTab);
}

function setupModalEvents() {
  // Status Modal
  cancelStatusBtn.addEventListener("click", () => (statusModal.hidden = true));
  statusModal.addEventListener("click", (e) => {
    if (e.target === statusModal) statusModal.hidden = true;
  });

  statusForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedReportForStatus) return;

    const newStatus = newStatusSelect.value;
    const notes = statusNotes.value.trim();

    if (!notes) {
      setMessage(statusModalMessage, "Please provide an audit reason or note for this status change.", "error");
      statusNotes.focus();
      return;
    }

    if (!confirmResolutionCheck.checked) {
      setMessage(statusModalMessage, "Please confirm the validation acknowledgment checkbox.", "error");
      confirmResolutionCheck.focus();
      return;
    }

    setBusy(saveStatusBtn, true, "Logging Status…");
    try {
      await updateReportStatus({
        reportId: selectedReportForStatus.id,
        previousStatus: selectedReportForStatus.status,
        newStatus,
        notes,
        city: selectedReportForStatus.city
      });

      setMessage(statusModalMessage, "Status updated and audit log recorded successfully!", "success");
      setTimeout(() => {
        statusModal.hidden = true;
        setBusy(saveStatusBtn, false);
        reloadData();
      }, 1000);
    } catch (err) {
      console.error(err);
      setMessage(statusModalMessage, errorMessage(err, "Failed to update status."), "error");
      setBusy(saveStatusBtn, false);
    }
  });

  // Flag Modal
  cancelFlagBtn.addEventListener("click", () => (flagModal.hidden = true));
  flagModal.addEventListener("click", (e) => {
    if (e.target === flagModal) flagModal.hidden = true;
  });

  flagForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedReportForFlag) return;

    setBusy(saveFlagBtn, true, "Saving Flags…");
    try {
      const notes = flagNotes.value.trim();
      const reportId = selectedReportForFlag.id;

      await flagReport({ reportId, flagType: "duplicate", value: flagDuplicate.checked, notes });
      await flagReport({ reportId, flagType: "suspicious", value: flagSuspicious.checked, notes });
      await flagReport({ reportId, flagType: "inappropriate", value: flagInappropriate.checked, notes });

      setMessage(flagModalMessage, "Moderation flags updated successfully!", "success");
      setTimeout(() => {
        flagModal.hidden = true;
        setBusy(saveFlagBtn, false);
        reloadData();
      }, 1000);
    } catch (err) {
      console.error(err);
      setMessage(flagModalMessage, errorMessage(err, "Failed to update flags."), "error");
      setBusy(saveFlagBtn, false);
    }
  });

  // User Modal (Super Admin)
  cancelUserBtn.addEventListener("click", () => (userModal.hidden = true));
  userModal.addEventListener("click", (e) => {
    if (e.target === userModal) userModal.hidden = true;
  });

  userRoleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const targetUserId = userModalUid.value.trim();
    const role = userModalRole.value;
    const status = userModalStatus.value;
    const assignedCities = Array.from(userModalCities.selectedOptions).map((o) => o.value);

    if (!targetUserId) {
      setMessage(userModalMessage, "Enter the Firebase Auth UID of the user.", "error");
      userModalUid.focus();
      return;
    }

    setBusy(saveUserBtn, true, "Saving Permissions…");
    try {
      await updateUserRole({ targetUserId, role, assignedCities, status });
      setMessage(userModalMessage, "User permissions saved successfully!", "success");
      setTimeout(() => {
        userModal.hidden = true;
        setBusy(saveUserBtn, false);
        loadUsers();
      }, 1200);
    } catch (err) {
      console.error(err);
      setMessage(userModalMessage, errorMessage(err, "Failed to update user permissions."), "error");
      setBusy(saveUserBtn, false);
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}
