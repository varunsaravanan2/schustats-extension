const URL_TO_CHECK = "https://www.schustats.com/seeding_algo";
const ALARM_NAME = "checkSchuStats";
const CHECK_INTERVAL_MINUTES = 30; // change this to check more/less often (recommended: 30-60, since checking too frequently risks the site's anti-bot system throttling you)

// --- Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  // Record the activation date: today if you enabled this on a Monday,
  // otherwise the upcoming Monday. No checking happens before this date.
  chrome.storage.local.set({ activationDate: getNextMondayKey(new Date()) });
  checkForUpdate();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForUpdate();
  }
});

// Allow the popup to trigger an immediate manual check.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_NOW") {
    checkForUpdate().then((result) => sendResponse(result));
    return true; // keep the message channel open for the async response
  }
});

// --- Core logic ---

// Returns a YYYY-MM-DD string for the Monday of the week containing `date`
// (using local time). Used to know which "week" we're currently in.
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Returns today's date as YYYY-MM-DD (local time), for simple string comparison.
function getDateKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Returns the date's own key if it's already a Monday, otherwise the next
// upcoming Monday's key. Used to decide when checking should first start.
function getNextMondayKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const daysUntilMonday = (1 - day + 7) % 7; // 0 if already Monday
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}


// This function is injected into the actual page and runs in page context.
// It must be self-contained (no closures over outer variables).
function extractLastUpdatedFromPage() {
  const text = document.body.innerText || "";
  const match = text.match(
    /last\s+updated[:\s]*(?:on\s+)?([A-Za-z0-9/,\-\s]{4,30}?\d{4})/i
  );
  return {
    found: !!match,
    date: match ? match[1].trim() : null,
    textLength: text.length,
    snippet: text.slice(0, 300),
  };
}

// Domains involved in loading the page's data (site + Firebase/reCAPTCHA
// infrastructure it depends on). We clear cookies/storage for these right
// before each check.
const RELATED_ORIGINS = [
  "https://www.schustats.com",
  "https://schustats-default-rtdb.firebaseio.com",
  "https://firestore.googleapis.com",
  "https://content-firebaseappcheck.googleapis.com",
  "https://www.google.com",
  "https://www.gstatic.com",
];

async function clearSiteData() {
  try {
    await chrome.browsingData.remove(
      { origins: RELATED_ORIGINS },
      {
        cookies: true,
        localStorage: true,
        indexedDB: true,
        cacheStorage: true,
        cache: true,
      }
    );
  } catch (err) {
    console.warn("Could not clear site data before check:", err);
  }
}

async function checkForUpdate() {
  const todayKey = getDateKey(new Date());
  let { activationDate } = await chrome.storage.local.get(["activationDate"]);

  // Safety net: if activationDate somehow isn't set (e.g. upgrading from an
  // older version of the extension), set it now so this logic still works.
  if (!activationDate) {
    activationDate = getNextMondayKey(new Date());
    await chrome.storage.local.set({ activationDate });
  }

  if (todayKey < activationDate) {
    await chrome.storage.local.set({
      lastChecked: new Date().toISOString(),
      lastStatus: `Not started yet — begins Monday, ${activationDate}`,
    });
    return { ok: true, skipped: true, reason: "not_activated_yet" };
  }

  const weekKey = getWeekKey(new Date());
  const weekState = await chrome.storage.local.get([
    "weekKey",
    "updateFoundThisWeek",
  ]);

  if (weekState.weekKey !== weekKey) {
    // A new week (Monday) has started — reset the "found" flag so checking resumes.
    await chrome.storage.local.set({ weekKey, updateFoundThisWeek: false });
  } else if (weekState.updateFoundThisWeek) {
    // Already found this week's update — skip checking until next Monday.
    await chrome.storage.local.set({
      lastChecked: new Date().toISOString(),
      lastStatus: "Already found this week's update — waiting until next Monday",
    });
    return { ok: true, skipped: true };
  }

  let tab;
  try {
    await clearSiteData();

    // Open the page in a background (inactive) tab so it doesn't interrupt you.
    tab = await chrome.tabs.create({ url: URL_TO_CHECK, active: false });

    // Wait for the tab to finish its initial load.
    await waitForTabComplete(tab.id);

    // The site fetches its data asynchronously (Firebase), so give it time
    // to finish after the initial page load before reading the content.
    const extraction = await waitForDataToAppear(tab.id, 50000);

    await chrome.tabs.remove(tab.id);

    const now = new Date().toISOString();
    const stored = await chrome.storage.local.get(["lastUpdatedDate"]);
    const previousDate = stored.lastUpdatedDate;

    if (!extraction.found) {
      await chrome.storage.local.set({
        lastChecked: now,
        lastStatus: `Could not find date text (length: ${extraction.textLength})`,
        lastSnippet: extraction.snippet,
      });
      return { ok: false, reason: "not_found", extraction };
    }

    const currentDate = extraction.date;

    if (!previousDate) {
      // First time ever — record it as the baseline. If that date itself
      // falls within the current week, the site has already updated this
      // week (we just didn't witness the change happen), so mark it found
      // and pause immediately instead of continuing to check pointlessly.
      const parsedDate = new Date(currentDate);
      const alreadyThisWeek =
        !isNaN(parsedDate) && getWeekKey(parsedDate) === weekKey;

      await chrome.storage.local.set({
        lastUpdatedDate: currentDate,
        lastChecked: now,
        lastStatus: alreadyThisWeek
          ? `First check — baseline recorded (${currentDate} is already this week's update, pausing until Monday)`
          : "First check — baseline recorded",
        updateFoundThisWeek: alreadyThisWeek,
      });
      return { ok: true, changed: false, currentDate };
    }

    if (currentDate !== previousDate) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "SchuStats Seeding Algo Updated!",
        message: `Changed from "${previousDate}" to "${currentDate}"`,
        priority: 2,
      });
      await chrome.storage.local.set({
        lastUpdatedDate: currentDate,
        lastChecked: now,
        lastStatus: `Updated: ${previousDate} → ${currentDate}`,
        updateFoundThisWeek: true,
      });
      return { ok: true, changed: true, currentDate, previousDate };
    } else {
      await chrome.storage.local.set({
        lastChecked: now,
        lastStatus: `No change (still ${currentDate})`,
      });
      return { ok: true, changed: false, currentDate };
    }
  } catch (err) {
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (_) {
        /* tab may already be closed */
      }
    }
    await chrome.storage.local.set({
      lastChecked: new Date().toISOString(),
      lastStatus: `Error: ${err.message || err}`,
    });
    return { ok: false, reason: "error", error: String(err) };
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Polls the page every 2s (up to maxWaitMs) until the "Last Updated" text
// appears, since it loads asynchronously after the initial page load.
// If it still hasn't shown up by the halfway point, reload the page once —
// the site sometimes fails to fetch its data on the first load.
async function waitForDataToAppear(tabId, maxWaitMs) {
  const pollIntervalMs = 2000;
  const reloadAtMs = Math.floor(maxWaitMs / 2);
  let waited = 0;
  let hasReloaded = false;

  while (waited < maxWaitMs) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractLastUpdatedFromPage,
    });
    if (result && result.result && result.result.found) {
      return result.result;
    }

    if (!hasReloaded && waited >= reloadAtMs) {
      hasReloaded = true;
      await chrome.tabs.reload(tabId);
      await waitForTabComplete(tabId);
      // Skip the normal poll delay right after a reload — the page needs
      // a moment before it's even worth checking again.
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      waited += pollIntervalMs;
      continue;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
    waited += pollIntervalMs;
  }

  // Final attempt / return whatever we last got, even if not found.
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractLastUpdatedFromPage,
  });
  return result.result;
}
