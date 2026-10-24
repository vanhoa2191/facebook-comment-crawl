'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('weekly alarm schedules a reminder and marks it due without sending data externally', async () => {
  const handlers = { installed: [], startup: [], alarm: [], action: [] };
  const created = [];
  const badges = [];
  const titles = [];
  const notifications = [];
  let state = {
    trackedPeople: [],
    comments: [{ id: 'c1', text: 'private comment' }],
    reports: [],
    logs: [],
    settings: { weeklyDays: 7, weeklyCursor: 0, lastReportAt: '', weeklyDueAt: '' }
  };
  const chrome = {
    runtime: {
      onInstalled: { addListener(fn) { handlers.installed.push(fn); } },
      onStartup: { addListener(fn) { handlers.startup.push(fn); } },
      getURL(pathname) { return 'chrome-extension://test/' + pathname; }
    },
    action: {
      onClicked: { addListener(fn) { handlers.action.push(fn); } },
      setBadgeText: async value => badges.push(value),
      setBadgeBackgroundColor: async value => badges.push(value),
      setTitle: async value => titles.push(value)
    },
    alarms: {
      get: async () => null,
      create: (name, options) => created.push({ name, options }),
      onAlarm: { addListener(fn) { handlers.alarm.push(fn); } }
    },
    storage: { local: {
      get: async () => ({ 'comment-crawl.state': state }),
      set: async value => { state = value['comment-crawl.state']; }
    } },
    tabs: { create: async value => { notifications.push(value); } }
  };
  const context = { chrome, Date, String, Number, Array, Math, Promise };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), context);

  await handlers.installed[0]();
  assert.equal(created.length, 1);
  assert.equal(created[0].name, 'comment-crawl-weekly-report');
  assert.equal(created[0].options.delayInMinutes, 10080);
  assert.equal(created[0].options.periodInMinutes, 10080);

  handlers.alarm[0]({ name: 'comment-crawl-weekly-report' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(state.settings.weeklyDueAt);
  assert.ok(state.logs.some(entry => /cần mở dashboard/i.test(entry.message)));
  assert.ok(badges.some(entry => entry.text === '7'));
  assert.ok(titles.some(entry => /đến kỳ tổng hợp/i.test(entry.title)));
  assert.deepEqual(notifications, []);
});
