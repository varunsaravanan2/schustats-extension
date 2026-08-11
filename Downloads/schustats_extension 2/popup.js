function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

async function refreshDisplay() {
  const stored = await chrome.storage.local.get([
    "lastUpdatedDate",
    "lastChecked",
    "lastStatus",
    "lastSnippet",
    "updateFoundThisWeek",
  ]);
  document.getElementById("lastUpdatedDate").textContent =
    stored.lastUpdatedDate || "Not checked yet";
  document.getElementById("lastChecked").textContent = formatTimestamp(
    stored.lastChecked
  );
  const weeklyNote = stored.updateFoundThisWeek
    ? " (found this week — paused until Monday)"
    : "";
  document.getElementById("lastStatus").textContent =
    (stored.lastStatus || "—") + weeklyNote;
  const snippetEl = document.getElementById("lastSnippet");
  if (snippetEl) {
    snippetEl.textContent = stored.lastSnippet || "";
  }
}

document.getElementById("checkNowBtn").addEventListener("click", () => {
  const btn = document.getElementById("checkNowBtn");
  const statusEl = document.getElementById("status");
  btn.disabled = true;
  statusEl.textContent = "Checking... (opens a background tab briefly)";

  chrome.runtime.sendMessage({ type: "CHECK_NOW" }, (response) => {
    btn.disabled = false;
    statusEl.textContent = "";
    refreshDisplay();
  });
});

refreshDisplay();
