// Dynamic Analytics & Chart Controller for Road Companion
// Computes real-time metrics and renders Chart.js charts using live Firestore records

import { CATEGORIES } from "./reports.js";
import { GUJARAT_CITIES } from "./cities.js";

let chartStatusInstance = null;
let chartCategoriesInstance = null;
let chartTimelineInstance = null;
let chartComparisonInstance = null;
let chartCitiesInstance = null;

const CHART_TEXT_COLOR = "#c9d7ea";
const CHART_GRID_COLOR = "rgba(255, 255, 255, 0.08)";

function getMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Filter reports by selected time range
 */
export function filterReportsByTime(reports, range, customStart = null, customEnd = null) {
  const now = new Date();
  let minTime = 0;
  let maxTime = Infinity;

  if (range === "today") {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    minTime = today.getTime();
  } else if (range === "7d") {
    minTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else if (range === "30d") {
    minTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  } else if (range === "6m") {
    minTime = now.getTime() - 180 * 24 * 60 * 60 * 1000;
  } else if (range === "custom") {
    if (customStart) minTime = new Date(customStart).getTime() || 0;
    if (customEnd) {
      const endD = new Date(customEnd);
      endD.setHours(23, 59, 59, 999);
      maxTime = endD.getTime();
    }
  }

  return reports.filter((r) => {
    const t = getMillis(r.createdAt);
    if (!t) return true; // Include if time cannot be parsed
    return t >= minTime && t <= maxTime;
  });
}

/**
 * Update all charts and stat elements with filtered data
 */
export function renderAnalyticsDashboard(filteredReports, statElements) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js is not loaded.");
    return;
  }

  // 1. Calculate Status Summary
  const statusCounts = {
    Pending: 0,
    Verified: 0,
    "In Progress": 0,
    Resolved: 0
  };

  filteredReports.forEach((r) => {
    if (statusCounts[r.status] !== undefined) {
      statusCounts[r.status]++;
    } else {
      statusCounts.Pending++;
    }
  });

  if (statElements) {
    if (statElements.total) statElements.total.textContent = String(filteredReports.length);
    if (statElements.Pending) statElements.Pending.textContent = String(statusCounts.Pending);
    if (statElements.Verified) statElements.Verified.textContent = String(statusCounts.Verified);
    if (statElements.Progress) statElements.Progress.textContent = String(statusCounts["In Progress"]);
    if (statElements.Resolved) statElements.Resolved.textContent = String(statusCounts.Resolved);
  }

  // 2. Render Status Donut Chart
  renderStatusChart(statusCounts);

  // 3. Render Category Breakdown Bar Chart
  renderCategoryChart(filteredReports);

  // 4. Render Submission Timeline Line Chart
  renderTimelineChart(filteredReports);

  // 5. Render Pending vs. Resolved Grouped Chart
  renderComparisonChart(filteredReports);

  // 6. Render City Comparison Chart
  renderCityChart(filteredReports);
}

function renderStatusChart(statusCounts) {
  const ctx = document.getElementById("chartStatus")?.getContext("2d");
  if (!ctx) return;

  if (chartStatusInstance) chartStatusInstance.destroy();

  chartStatusInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pending", "Verified", "In Progress", "Resolved"],
      datasets: [
        {
          data: [
            statusCounts.Pending,
            statusCounts.Verified,
            statusCounts["In Progress"],
            statusCounts.Resolved
          ],
          backgroundColor: ["#d97706", "#2563eb", "#7c3aed", "#059669"],
          borderColor: "#0d1b30",
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: CHART_TEXT_COLOR, padding: 12, font: { size: 12 } }
        }
      }
    }
  });
}

function renderCategoryChart(reports) {
  const ctx = document.getElementById("chartCategories")?.getContext("2d");
  if (!ctx) return;

  const categoryCounts = {};
  CATEGORIES.forEach((c) => (categoryCounts[c] = 0));

  reports.forEach((r) => {
    const cat = CATEGORIES.includes(r.category) ? r.category : "Other";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  if (chartCategoriesInstance) chartCategoriesInstance.destroy();

  chartCategoriesInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: CATEGORIES,
      datasets: [
        {
          label: "Reports",
          data: CATEGORIES.map((c) => categoryCounts[c]),
          backgroundColor: "rgba(212, 166, 74, 0.8)",
          borderColor: "#d4a64a",
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
        y: { ticks: { color: CHART_TEXT_COLOR, precision: 0 }, grid: { color: CHART_GRID_COLOR } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderTimelineChart(reports) {
  const ctx = document.getElementById("chartTimeline")?.getContext("2d");
  if (!ctx) return;

  // Group by date (YYYY-MM-DD)
  const dateMap = new Map();

  reports.forEach((r) => {
    const millis = getMillis(r.createdAt);
    if (!millis) return;
    const dateKey = new Date(millis).toISOString().slice(0, 10);
    dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
  });

  // Sort dates
  const sortedDates = Array.from(dateMap.keys()).sort();
  const counts = sortedDates.map((d) => dateMap.get(d));

  if (chartTimelineInstance) chartTimelineInstance.destroy();

  chartTimelineInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: sortedDates.length ? sortedDates : ["No submissions"],
      datasets: [
        {
          label: "Citizen Reports",
          data: counts.length ? counts : [0],
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.15)",
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#60a5fa",
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: CHART_TEXT_COLOR }, grid: { color: CHART_GRID_COLOR } },
        y: { ticks: { color: CHART_TEXT_COLOR, precision: 0 }, grid: { color: CHART_GRID_COLOR } }
      },
      plugins: {
        legend: { labels: { color: CHART_TEXT_COLOR } }
      }
    }
  });
}

function renderComparisonChart(reports) {
  const ctx = document.getElementById("chartComparison")?.getContext("2d");
  if (!ctx) return;

  // Group by category: Pending vs Resolved
  const categories = CATEGORIES.slice(0, 5); // Top 5
  const pendingByCat = categories.map(
    (cat) => reports.filter((r) => r.category === cat && r.status === "Pending").length
  );
  const resolvedByCat = categories.map(
    (cat) => reports.filter((r) => r.category === cat && r.status === "Resolved").length
  );

  if (chartComparisonInstance) chartComparisonInstance.destroy();

  chartComparisonInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: categories,
      datasets: [
        {
          label: "Pending",
          data: pendingByCat,
          backgroundColor: "rgba(217, 119, 6, 0.8)",
          borderColor: "#d97706",
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: "Resolved",
          data: resolvedByCat,
          backgroundColor: "rgba(5, 150, 105, 0.8)",
          borderColor: "#059669",
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
        y: { ticks: { color: CHART_TEXT_COLOR, precision: 0 }, grid: { color: CHART_GRID_COLOR } }
      },
      plugins: {
        legend: { labels: { color: CHART_TEXT_COLOR } }
      }
    }
  });
}

function renderCityChart(reports) {
  const ctx = document.getElementById("chartCities")?.getContext("2d");
  if (!ctx) return;

  const cityMap = new Map();
  GUJARAT_CITIES.forEach((c) => cityMap.set(c.name, 0));

  reports.forEach((r) => {
    const city = r.city || "Other";
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
  });

  // Filter to cities with at least 1 report, or top 6 cities
  const sorted = Array.from(cityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (chartCitiesInstance) chartCitiesInstance.destroy();

  chartCitiesInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          label: "Reports",
          data: sorted.map((s) => s[1]),
          backgroundColor: "rgba(124, 58, 237, 0.75)",
          borderColor: "#7c3aed",
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
        y: { ticks: { color: CHART_TEXT_COLOR, precision: 0 }, grid: { color: CHART_GRID_COLOR } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}
