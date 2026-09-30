import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pluginMarkdown = fs.readFileSync(new URL("../amplenote-homework-scheduler.md", import.meta.url), "utf8");
const pluginSource = pluginMarkdown
  .match(/```javascript\r?\n([\s\S]*?)\r?\n```/)[1]
  .replace("const CALENDAR_FETCH_TIMEOUT_MS = 4000;", "const CALENDAR_FETCH_TIMEOUT_MS = 10;");
const plugin = new Function(`return (${pluginSource});`)();

function futureIcsDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(8, 0, 0, 0);
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}T${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

function createApp({ noteText, tasks = [], settings = {} }) {
  const inserts = [];
  const updates = [];
  const alerts = [];
  let fetchTaskCalls = 0;
  let noteContentCalls = 0;
  return {
    context: { noteUUID: "homework-note" },
    settings,
    inserts,
    updates,
    alerts,
    get fetchTaskCalls() { return fetchTaskCalls; },
    get noteContentCalls() { return noteContentCalls; },
    async getNoteContent() { noteContentCalls++; return noteText; },
    async getNoteTasks() { fetchTaskCalls++; return tasks; },
    async insertTask(_note, task) { inserts.push(task); return "new-task"; },
    async updateTask(uuid, updatesForTask) { updates.push({ uuid, ...updatesForTask }); return true; },
    async replaceNoteContent() { return true; },
    async alert(message) { alerts.push(message); return null; },
  };
}

test("marks a task created with the timetable fallback", async () => {
  const app = createApp({ noteText: "Mathe: S. 42" });

  await plugin.noteOption(app);

  assert.equal(app.inserts.length, 1);
  assert.equal(app.inserts[0].content, "Mathe: S. 42 · fallback");
  assert.equal(app.fetchTaskCalls, 0);
});

test("reschedules an open fallback task with one calendar fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const start = futureIcsDate(3);
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(
      `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:mathe\r\nDTSTART:${start}\r\nSUMMARY:Mathe\r\nEND:VEVENT\r\nEND:VCALENDAR`,
      { headers: { "X-Calendar-Cache": "HIT" } }
    );
  };

  try {
    const app = createApp({
      noteText: "- [ ] Mathe: S. 42 · fallback",
      tasks: [{ uuid: "fallback-task", content: "Mathe: S. 42 · fallback", startAt: Math.floor(Date.now() / 1000) + 86400 }],
      settings: { "Calendar Proxy URL": "https://calendar.example.test/", "Calendar Proxy Access Token": "token" },
    });

    await plugin.noteOption(app);

    assert.equal(fetchCalls, 1);
    assert.equal(app.fetchTaskCalls, 1);
    assert.deepEqual(app.inserts, []);
    assert.equal(app.updates.length, 1);
    assert.equal(app.updates[0].uuid, "fallback-task");
    assert.equal(app.updates[0].content, "Mathe: S. 42");
    assert.ok(app.updates[0].endAt > app.updates[0].startAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a fallback task unchanged when the calendar is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };

  try {
    const app = createApp({
      noteText: "- [ ] Mathe: S. 42 · fallback",
      tasks: [{ uuid: "fallback-task", content: "Mathe: S. 42 · fallback", startAt: Math.floor(Date.now() / 1000) + 86400 }],
      settings: { "Calendar Proxy URL": "https://calendar.example.test/", "Calendar Proxy Access Token": "token" },
    });

    await plugin.noteOption(app);

    assert.deepEqual(app.inserts, []);
    assert.deepEqual(app.updates, []);
    assert.equal(app.noteContentCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the timetable fallback when the calendar request times out", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")));
  });

  try {
    const app = createApp({
      noteText: "Psemi: things",
      settings: { "Calendar Proxy URL": "https://calendar.example.test/", "Calendar Proxy Access Token": "token" },
    });

    await plugin.noteOption(app);

    assert.equal(app.inserts.length, 1);
    assert.equal(app.inserts[0].content, "P-Seminar: things · fallback");
    assert.match(app.alerts[0], /timed out after 0.01s/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
