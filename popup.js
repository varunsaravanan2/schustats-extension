const ALARM_NAME = "checkSchuStats";

function formatTimestamp(iso) {
  if (!iso) return "";
  return "· " + new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function timeUntil(ms) {
  const mins = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (mins < 1) return "Any moment";
  if (mins < 60) return `In ${mins} min`;
  return `In ${Math.round(mins / 60)} hr`;
}

// Same YYYY-MM-DD format background.js uses for activationDate.
function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextMondayLabel() {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function setState(kind, text) {
  const line = document.getElementById("stateLine");
  line.className = kind;
  line.textContent = text;
}

async function refreshDisplay() {
  const stored = await chrome.storage.local.get([
    "lastUpdatedDate",
    "lastChecked",
    "lastStatus",
    "updateFoundThisWeek",
    "activationDate",
  ]);

  document.getElementById("lastUpdatedDate").textContent =
    stored.lastUpdatedDate || "Not checked yet";
  document.getElementById("lastCheckedAgo").textContent = timeAgo(
    stored.lastChecked
  );
  document.getElementById("lastChecked").textContent = formatTimestamp(
    stored.lastChecked
  );
  document.getElementById("lastStatus").textContent = stored.lastStatus || "—";

  const notStarted =
    stored.activationDate && todayKey() < stored.activationDate;
  const failed = /^(Error|Could not)/.test(stored.lastStatus || "");
  const nextCheck = document.getElementById("nextCheck");

  if (notStarted) {
    setState("waiting", "Not started yet. Checking begins Monday.");
    nextCheck.textContent = `Monday, ${stored.activationDate}`;
  } else if (stored.updateFoundThisWeek) {
    setState("found", "Updated this week. Paused until Monday.");
    nextCheck.textContent = `Monday, ${nextMondayLabel()}`;
  } else {
    setState(
      failed ? "error" : "",
      failed ? "Last check failed." : "Waiting for this week's update."
    );
    const alarm = await chrome.alarms.get(ALARM_NAME);
    nextCheck.textContent = alarm
      ? timeUntil(alarm.scheduledTime).toLowerCase()
      : "—";
  }
}

document.getElementById("checkNowBtn").addEventListener("click", () => {
  const btn = document.getElementById("checkNowBtn");
  const statusEl = document.getElementById("status");
  btn.disabled = true;
  btn.textContent = "Checking…";
  statusEl.textContent = "Opens a background tab for a few seconds";

  chrome.runtime.sendMessage({ type: "CHECK_NOW" }, () => {
    btn.disabled = false;
    btn.textContent = "Check now";
    statusEl.textContent = "";
    refreshDisplay();
  });
});

refreshDisplay();
