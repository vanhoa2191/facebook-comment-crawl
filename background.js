'use strict';
const KEY = 'comment-crawl.state';
const ALARM = 'comment-crawl-weekly-report';
const WEEK_MINUTES = 7 * 24 * 60;

async function scheduleWeeklyReminder() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) chrome.alarms.create(ALARM, { delayInMinutes: WEEK_MINUTES, periodInMinutes: WEEK_MINUTES });
}
async function markWeeklyReminderDue() {
  const stored = await chrome.storage.local.get(KEY);
  const state = stored[KEY];
  if (!state || !state.settings) return;
  const now = new Date().toISOString();
  const last = Date.parse(state.settings.lastReportAt || '');
  const previousDue = Date.parse(state.settings.weeklyDueAt || '');
  if (Number.isFinite(previousDue) && Number.isFinite(last) && last >= previousDue) state.settings.weeklyDueAt = '';
  if (!state.settings.weeklyDueAt) {
    state.settings.weeklyDueAt = now;
    state.logs = Array.isArray(state.logs) ? state.logs : [];
    state.logs.unshift({ at: now, message: 'Đến kỳ nhắc tổng hợp báo cáo hằng tuần. Mở Side Panel và xác nhận trước khi gửi dữ liệu sang Meta AI Web.' });
    state.logs = state.logs.slice(0, 500);
    await chrome.storage.local.set({ [KEY]: state });
  }
  await chrome.action.setBadgeText({ text: '7' });
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setTitle({ title: 'Facebook Comment Crawl: đến kỳ tổng hợp báo cáo' });
}
chrome.action.onClicked.addListener(async tab => {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && Number.isInteger(tab && tab.windowId)) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (_) {}
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
chrome.runtime.onInstalled.addListener(() => scheduleWeeklyReminder().catch(() => {}));
chrome.runtime.onStartup.addListener(() => scheduleWeeklyReminder().catch(() => {}));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) markWeeklyReminderDue().catch(() => {});
});
