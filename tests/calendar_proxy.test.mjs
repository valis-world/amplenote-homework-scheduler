import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cloudflare_worker_calendar_proxy.js";

class MemoryKv {
  values = new Map();

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

const calendar = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

function createEnv(kv = new MemoryKv()) {
  return {
    ACCESS_TOKEN: "test-token",
    ICS_URL: "https://calendar.example.test/private.ics",
    CALENDAR_CACHE: kv,
  };
}

function authorizedRequest(path = "https://worker.example.test/") {
  return new Request(path, {
    headers: {
      Authorization: "Bearer test-token",
      Origin: "https://www.amplenote.com",
    },
  });
}

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("returns a fresh KV snapshot without calling Google", { concurrency: false }, async () => {
  const kv = new MemoryKv();
  await kv.put("calendar-snapshot", JSON.stringify({ icsText: calendar, fetchedAt: Date.now() }));
  let upstreamCalls = 0;

  await withFetch(async () => {
    upstreamCalls += 1;
    return new Response(calendar);
  }, async () => {
    const response = await worker.fetch(authorizedRequest(), createEnv(kv));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), calendar);
    assert.equal(response.headers.get("X-Calendar-Cache"), "HIT");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Access-Control-Expose-Headers"), /X-Calendar-Fetched-At/);
  });

  assert.equal(upstreamCalls, 0);
});

test("refreshes and replaces an expired snapshot", { concurrency: false }, async () => {
  const kv = new MemoryKv();
  await kv.put("calendar-snapshot", JSON.stringify({ icsText: "BEGIN:VCALENDAR\r\nOLD", fetchedAt: Date.now() - 300_001 }));
  let upstreamCalls = 0;

  await withFetch(async () => {
    upstreamCalls += 1;
    return new Response(calendar, { status: 200 });
  }, async () => {
    const response = await worker.fetch(authorizedRequest(), createEnv(kv));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Calendar-Cache"), "MISS");
    assert.equal(await response.text(), calendar);
  });

  assert.equal(upstreamCalls, 1);
  assert.equal(JSON.parse(await kv.get("calendar-snapshot")).icsText, calendar);
});

test("never serves an expired snapshot when refresh fails", { concurrency: false }, async () => {
  const kv = new MemoryKv();
  const staleCalendar = "BEGIN:VCALENDAR\r\nSTALE";
  await kv.put("calendar-snapshot", JSON.stringify({ icsText: staleCalendar, fetchedAt: Date.now() - 300_001 }));

  await withFetch(async () => {
    throw new Error("Google is unavailable");
  }, async () => {
    const response = await worker.fetch(authorizedRequest(), createEnv(kv));
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Calendar refresh failed");
  });
});

test("scheduled refresh writes a valid calendar snapshot", { concurrency: false }, async () => {
  const kv = new MemoryKv();

  await withFetch(async () => new Response(calendar, { status: 200 }), async () => {
    await worker.scheduled({}, createEnv(kv));
  });

  const snapshot = JSON.parse(await kv.get("calendar-snapshot"));
  assert.equal(snapshot.icsText, calendar);
  assert.ok(snapshot.fetchedAt <= Date.now());
});

test("rejects unauthenticated requests before reading the cache", { concurrency: false }, async () => {
  const kv = new MemoryKv();
  const response = await worker.fetch(new Request("https://worker.example.test/"), createEnv(kv));
  assert.equal(response.status, 401);
});
