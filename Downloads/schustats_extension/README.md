# SchuStats Update Monitor

A Chrome extension that watches [SchuStats.com's seeding algo page](https://www.schustats.com/seeding_algo)
and sends you a desktop notification when its "Last Updated" date changes,
so you don't have to keep checking manually.

## How it works

- Starts checking on the **Monday** after you enable it (or immediately, if
  you enable it on a Monday).
- Once active, it checks the site every 30 minutes (configurable), every day,
  until it detects a real update.
- Once it finds that week's update, it **stops checking** and stays quiet
  until the following Monday, when the cycle resets automatically.
- Each check briefly opens the page in an inactive background tab (it won't
  steal focus from what you're doing), reads the page, and closes it.
- Clears cookies/site data for the site's domains before each check, since
  the site uses Firebase App Check and reCAPTCHA to verify real visitors,
  and a clean state seems to load more reliably than a reused one.

## Install

1. Clone or download this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked** and select this folder.
5. That's it, it's now running.

Click the extension's icon anytime to see:
- The last known "Last Updated" date
- When it last checked
- Current status (including whether it's paused for the week, or hasn't
  started yet)
- A debug snippet of the page text, useful if a check ever fails to find
  the date

You can also click **Check Now** in the popup to trigger a check manually
(note: this respects the weekly pause. If it already found this week's
update, Check Now won't force another check until next Monday).

## Configuration

Open `background.js` and edit the top of the file:

```js
const CHECK_INTERVAL_MINUTES = 30; // how often to check, in minutes
```

Recommended range: 30 to 60 minutes. Checking much more often increases the
chance of the site's anti-bot protection throttling requests.

After editing, reload the extension at `chrome://extensions` (click the
circular reload icon on the extension's card) for the change to take effect.

## Notes / known limitations

- The site's data loads asynchronously and is protected by Firebase App
  Check and reCAPTCHA v3, which is designed to detect and deprioritize
  automated browsing. This extension works around that as best it can
  (real browser tab, cleared cookies, retry with reload, generous timeouts),
  but occasional failed checks are possible. A failed check never overwrites
  the last known good date, so no update will be silently missed, it'll
  just be caught on a later check.
- Chrome (not necessarily the active window, but running) needs to be open
  for checks to fire. If your Mac is asleep, checks resume once it wakes.
- If Chrome is fully quit, checks pause until you reopen it.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (Manifest V3) |
| `background.js` | Core logic: scheduling, checking, notifying |
| `popup.html` / `popup.js` | Status popup shown when clicking the extension icon |
| `icons/` | Extension icons |
