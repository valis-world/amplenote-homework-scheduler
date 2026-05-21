| | |
|-|-|
|name<!-- {"cell":{"colwidth":102}} -->|amplenote-homework-scheduler|
|icon<!-- {"cell":{"colwidth":102}} -->|school|
|description<!-- {"cell":{"colwidth":102}} -->|An Amplenote plugin that converts plain text homework notes into scheduled tasks.|
|setting<!-- {"cell":{"colwidth":102}} -->|Calendar Proxy URL|
|setting<!-- {"cell":{"colwidth":102}} -->|Calendar Proxy Access Token|
|instructions<!-- {"cell":{"colwidth":102}} -->|Paste your Cloudflare Worker URL into "Calendar Proxy URL" and your random access token into "Calendar Proxy Access Token". The plugin schedules detected homework for the day before the next matching lesson at 17:00. If the calendar cannot be read, or if no matching lesson is found for a subject, it falls back to the hardcoded timetable.|
```javascript
{
  async noteOption(app) {
    const CALENDAR_PROXY_URL_SETTING_NAME = "Calendar Proxy URL";
    const CALENDAR_PROXY_TOKEN_SETTING_NAME = "Calendar Proxy Access Token";
    const LOOKAHEAD_DAYS = 35;
    const HOMEWORK_START_HOUR = 17;
    const HOMEWORK_START_MINUTE = 0;

    // Day numbers: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
    const timetable = {
      "Mathe":                [3, 5],
      "Physik":               [3, 4],
      "Musik":                [2],
      "Deutsch":              [1, 4],
      "Geschichte":           [2, 5],
      "Geographie":           [2, 5],
      "Latein":               [1, 3],
      "Englisch":             [2, 5],
      "Biologie":             [1, 3],
      "Informatik":           [5],
      "Chemie":               [1, 4],
      "Religion":             [2],
      "Wirtschaft und Recht": [1],
      "PuG":                  [2, 5],
      "Sport":                [2],
      "Kunst":                [2],
    };

    const subjectAliases = {
      "Mathe":                ["mathe", "math", "ma", "mathematik"],
      "Physik":               ["physik", "phy", "ph"],
      "Musik":                ["musik", "mus", "mu"],
      "Deutsch":              ["deutsch", "deu", "ger", "de"],
      "Geschichte":           ["geschichte", "ges", "his", "hist"],
      "Geographie":           ["geographie", "geo", "erdkunde"],
      "Latein":               ["latein", "lat", "la"],
      "Englisch":             ["englisch", "eng", "en"],
      "Biologie":             ["biologie", "bio", "bi"],
      "Informatik":           ["informatik", "info", "inf", "it", "cs"],
      "Chemie":               ["chemie", "che", "ch"],
      "Religion":             ["religion", "rel", "reli", "katholisch", "kath", "k"],
      "Wirtschaft und Recht": ["wirtschaft und recht", "wirtschaft", "wr", "w+r", "w&r", "w & r", "econ", "wur"],
      "PuG":                  ["pug", "pu+g", "politik", "gesellschaft", "politik und gesellschaft"],
      "Sport":                ["sport", "spo", "sm"],
      "Kunst":                ["kunst", "ku"],
    };

    const subjectDurations = {
      "Mathe":                30,
      "Physik":               30,
      "Musik":                20,
      "Deutsch":              45,
      "Geschichte":           30,
      "Geographie":           20,
      "Latein":               40,
      "Englisch":             30,
      "Biologie":             30,
      "Informatik":           10,
      "Chemie":               30,
      "Religion":             20,
      "Wirtschaft und Recht": 20,
      "PuG":                  20,
      "Sport":                10,
      "Kunst":                20,
    };

    const normalizeMatchText = (value) => {
      const text = String(value || "").toLowerCase();
      const normalized = text.normalize ? text.normalize("NFD") : text;
      return normalized
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");
    };

    const charSimilarity = (a, b, allowSubstring = true) => {
      a = normalizeMatchText(a);
      b = normalizeMatchText(b);
      if (!a || !b) return 0;
      if (a === b) return 1.0;
      if (Math.min(a.length, b.length) < 3) return 0;
      if (allowSubstring && (a.includes(b) || b.includes(a))) return 0.92;
      const pool = b.split("");
      let matches = 0;
      for (const ch of a) {
        const idx = pool.indexOf(ch);
        if (idx !== -1) { matches++; pool.splice(idx, 1); }
      }
      return matches / Math.max(a.length, b.length);
    };

    const extractToken = (line) => {
      const trimmed = line.trim();
      const sep = trimmed.search(/[:-]/);
      return sep !== -1 ? trimmed.slice(0, sep).trim() : trimmed.split(/\s+/)[0];
    };

    const stripHtml = (value) => {
      return String(value || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'");
    };

    const calendarCandidates = (summary, description = "") => {
      const cleaned = `${String(summary || "")}\n${stripHtml(description)}`
        .replace(/[()[\]{}<>]/g, " ");
      const pieces = cleaned.split(/[:\-|,;/]+/).map(s => s.trim()).filter(Boolean);
      const words = cleaned.split(/[^A-Za-z0-9+&ÄÖÜäöüß]+/).map(s => s.trim()).filter(Boolean);
      const pairs = [];
      for (let i = 0; i < words.length - 1; i++) pairs.push(`${words[i]} ${words[i + 1]}`);
      return [cleaned, ...pieces, ...words, ...pairs];
    };

    const MATCH_THRESHOLD = 0.70;
    const bestSubjectMatch = (candidates, options = {}) => {
      const allowSubstring = options.allowSubstring !== false;
      let best = null;
      let bestScore = 0;
      for (const candidate of candidates) {
        for (const [subject, aliases] of Object.entries(subjectAliases)) {
          for (const form of [subject, ...aliases]) {
            const score = charSimilarity(candidate, form, allowSubstring);
            if (score > bestScore) { bestScore = score; best = subject; }
          }
        }
      }
      return bestScore >= MATCH_THRESHOLD ? { subject: best, score: bestScore } : null;
    };

    const matchHomeworkSubject = (line) => {
      const token = extractToken(line);
      return token ? bestSubjectMatch([token], { allowSubstring: false }) : null;
    };

    const matchCalendarSubject = (summary, description = "") => bestSubjectMatch(calendarCandidates(summary, description));

    const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const subjectForms = () => {
      const forms = [];
      for (const [subject, aliases] of Object.entries(subjectAliases)) {
        for (const form of [subject, ...aliases]) forms.push({ subject, form });
      }
      return forms.sort((a, b) => b.form.length - a.form.length);
    };

    const parseHomeworkLine = (line) => {
      const trimmed = line.trim();
      for (const { subject, form } of subjectForms()) {
        const patternText = escapeRegExp(form).replace(/\s+/g, "\\s+");
        const pattern = new RegExp(`^${patternText}(?=$|\\s|\\s*[:\\-])`, "i");
        const prefix = trimmed.match(pattern);
        if (!prefix) continue;
        const homework = trimmed.slice(prefix[0].length).replace(/^[: -]+/, "").trim();
        if (homework) return { subject, homework };
      }

      const match = matchHomeworkSubject(trimmed);
      if (!match) return null;
      const token = extractToken(trimmed);
      const homework = trimmed.slice(token.length).replace(/^[: -]+/, "").trim();
      return homework ? { subject: match.subject, homework } : null;
    };

    const extractText = (node) => {
      if (!node) return "";
      if (typeof node === "string") return node;
      if (node.type === "text" && node.text) return node.text;
      if (node.content && Array.isArray(node.content))
        return node.content.map(extractText).join("");
      return "";
    };

    const getNoteText = async (uuid) => {
      const content = await app.getNoteContent({ uuid });
      if (!content) return "";
      if (typeof content === "string") return content;
      if (content.content && Array.isArray(content.content))
        return content.content.map(extractText).join("\n");
      return extractText(content);
    };

    const reorderActiveTasks = (raw) => {
      if (typeof raw !== "string") return raw;
      const lines = raw.split("\n");
      const parseStartAt = (line) => {
        const patterns = [
          new RegExp('"startAt"\\s*:\\s*(\\d+)'),
          new RegExp("'startAt'\\s*:\\s*(\\d+)"),
          new RegExp("&quot;startAt&quot;\\s*:\\s*(\\d+)"),
        ];
        let m = null;
        for (const pattern of patterns) {
          m = line.match(pattern);
          if (m) break;
        }
        return m ? parseInt(m[1], 10) : null;
      };
      const isUncheckedTask = (line) => line.trim().startsWith("- [ ]");

      const taskEntries = [];
      const taskLineIndexes = [];
      for (let i = 0; i < lines.length; i++) {
        if (!isUncheckedTask(lines[i])) continue;
        taskLineIndexes.push(i);
        taskEntries.push({
          line: lines[i],
          startAt: parseStartAt(lines[i]),
          originalIndex: i,
        });
      }

      if (taskEntries.length <= 1) return raw;

      const scheduled = taskEntries
        .filter(entry => entry.startAt !== null)
        .sort((a, b) => a.startAt - b.startAt || a.originalIndex - b.originalIndex);
      const unscheduled = taskEntries
        .filter(entry => entry.startAt === null)
        .sort((a, b) => a.originalIndex - b.originalIndex);
      const sortedTaskLines = [...scheduled, ...unscheduled].map(entry => entry.line);
      const firstTaskIndex = taskLineIndexes[0];
      const out = [];

      for (let i = 0; i < lines.length; i++) {
        if (i === firstTaskIndex) out.push(...sortedTaskLines);
        if (isUncheckedTask(lines[i])) continue;
        out.push(lines[i]);
      }

      return out.join("\n");
    };

    const removeCreatedHomeworkLines = (raw, linesToRemove) => {
      const remainingCounts = {};
      for (const line of linesToRemove) {
        const key = line.trim();
        remainingCounts[key] = (remainingCounts[key] || 0) + 1;
      }
      return raw.split(/\r?\n/)
        .filter(line => {
          const key = line.trim();
          if (remainingCounts[key] > 0) {
            remainingCounts[key]--;
            return false;
          }
          return true;
        })
        .join("\n");
    };

    const sortMessages = (messages) => messages.slice().sort((a, b) => a.localeCompare(b));

    const truncate = (value, maxLength) => {
      const text = String(value || "").trim();
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    };

    const normalizeProxyUrl = (url) => String(url || "").trim();

    const fetchCalendarText = async (url, token) => {
      const normalized = normalizeProxyUrl(url);
      const accessToken = String(token || "").trim();
      if (!normalized) throw new Error(`No "${CALENDAR_PROXY_URL_SETTING_NAME}" setting configured`);
      if (!accessToken) throw new Error(`No "${CALENDAR_PROXY_TOKEN_SETTING_NAME}" setting configured`);
      const authorization = accessToken.toLowerCase().startsWith("bearer ") ? accessToken : `Bearer ${accessToken}`;

      const response = await fetch(normalized, {
        headers: {
          Authorization: authorization,
          Accept: "text/calendar, text/plain, */*",
        },
      });
      if (!response.ok) {
        let body = "";
        try {
          body = await response.text();
        } catch (err) {
          body = "";
        }
        const detail = body ? `: ${truncate(body, 120)}` : "";
        throw new Error(`HTTP ${response.status}${detail}`);
      }

      const text = await response.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Calendar proxy did not return an ICS calendar");
      return text;
    };

    const unfoldIcsLines = (icsText) => {
      return String(icsText || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    };

    const parseParams = (parts) => {
      const params = {};
      for (const part of parts) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
      }
      return params;
    };

    const parseIcsEvents = (icsText) => {
      const events = [];
      let current = null;
      for (const line of unfoldIcsLines(icsText)) {
        if (line === "BEGIN:VEVENT") {
          current = {};
          continue;
        }
        if (line === "END:VEVENT") {
          if (current) events.push(current);
          current = null;
          continue;
        }
        if (!current) continue;

        const colon = line.indexOf(":");
        if (colon === -1) continue;
        const nameParts = line.slice(0, colon).split(";");
        const name = nameParts[0].toUpperCase();
        const prop = {
          name,
          params: parseParams(nameParts.slice(1)),
          value: line.slice(colon + 1),
        };
        if (!current[name]) current[name] = [];
        current[name].push(prop);
      }
      return events;
    };

    const firstProp = (event, name) => {
      const props = event[name];
      return props && props.length ? props[0] : null;
    };

    const propValue = (prop) => prop ? prop.value : "";
    const propParams = (prop) => prop ? prop.params : {};

    const unescapeIcsText = (value) => {
      return String(value || "")
        .replace(/\\n/gi, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
    };

    const parseIcsDate = (value, params = {}) => {
      if (!value) return null;
      const raw = String(value).trim();
      const dateOnly = params.VALUE === "DATE" || /^\d{8}$/.test(raw);
      const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
      if (!m) return null;
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      const hour = parseInt(m[4] || "0", 10);
      const minute = parseInt(m[5] || "0", 10);
      const second = parseInt(m[6] || "0", 10);
      if (m[7]) return new Date(Date.UTC(year, month, day, hour, minute, second));
      return new Date(year, month, day, dateOnly ? 0 : hour, dateOnly ? 0 : minute, dateOnly ? 0 : second);
    };

    const parseIcsDateList = (prop) => {
      if (!prop) return [];
      return prop.value.split(",").map(v => parseIcsDate(v, prop.params)).filter(Boolean);
    };

    const parseRRule = (value) => {
      const rule = {};
      for (const part of String(value || "").split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
      }
      return rule;
    };

    const getEventUid = (event) => propValue(firstProp(event, "UID"));

    const getRecurrenceId = (event) => {
      const recurrenceProp = firstProp(event, "RECURRENCE-ID");
      return parseIcsDate(propValue(recurrenceProp), propParams(recurrenceProp));
    };

    const addRecurrenceExclusion = (exclusions, uid, date) => {
      if (!uid || !date) return;
      if (!exclusions[uid]) exclusions[uid] = { times: new Set(), days: new Set() };
      exclusions[uid].times.add(date.getTime());
      exclusions[uid].days.add(dayKey(date));
    };

    const dayKey = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const weekDayCode = (date) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getDay()];
    const weekDayIndex = (code) => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 })[code];

    const startOfWeek = (date) => {
      const out = new Date(date);
      out.setDate(date.getDate() - date.getDay());
      out.setHours(0, 0, 0, 0);
      return out;
    };

    const addDays = (date, days) => {
      const out = new Date(date);
      out.setDate(out.getDate() + days);
      return out;
    };

    const eventText = (event) => {
      return {
        summary: unescapeIcsText(propValue(firstProp(event, "SUMMARY"))),
        description: unescapeIcsText(propValue(firstProp(event, "DESCRIPTION"))),
      };
    };

    const eventSubject = (event) => {
      const { summary, description } = eventText(event);
      const match = matchCalendarSubject(summary, description);
      return match ? match.subject : null;
    };

    const eventTimeRange = (event) => {
      const dtStartProp = firstProp(event, "DTSTART");
      if (!dtStartProp || dtStartProp.params.VALUE === "DATE") return null;
      const start = parseIcsDate(propValue(dtStartProp), propParams(dtStartProp));
      if (!start) return null;

      const dtEndProp = firstProp(event, "DTEND");
      const end = parseIcsDate(propValue(dtEndProp), propParams(dtEndProp));
      return {
        start,
        end: end && end > start ? end : new Date(start.getTime() + 45 * 60 * 1000),
      };
    };

    const isCancellationEvent = (event) => {
      const status = propValue(firstProp(event, "STATUS")).toUpperCase();
      const { summary, description } = eventText(event);
      return status === "CANCELLED" || /\[(?:X|x)\]/.test(summary) || /<b>\s*CANCELLED\s*\[X\]\s*<\/b>/i.test(description);
    };

    const isUpdateEvent = (event) => {
      const { summary, description } = eventText(event);
      return /\[\+\]/.test(summary) || /<b>\s*UPDATED\s*\[\+\]\s*<\/b>/i.test(description);
    };

    const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

    const blockingEvents = (events, windowStart, windowEnd) => {
      const blocks = [];
      for (const event of events) {
        let kind = null;
        if (isCancellationEvent(event)) kind = "cancel";
        else if (isUpdateEvent(event)) kind = "update";
        if (!kind) continue;

        const range = eventTimeRange(event);
        if (!range || !rangesOverlap(range.start, range.end, windowStart, windowEnd)) continue;

        const { summary } = eventText(event);
        blocks.push({
          kind,
          subject: eventSubject(event),
          start: range.start,
          end: range.end,
          summary,
        });
      }
      return blocks;
    };

    const isBlockedByWebUntisChange = (subject, start, end, blocks) => {
      return blocks.some(block => {
        if (!rangesOverlap(start, end, block.start, block.end)) return false;
        if (!block.subject) return true;
        if (block.kind === "cancel") return block.subject === subject;
        if (block.kind === "update") return block.subject !== subject;
        return false;
      });
    };

    const isCancelledOrNonLesson = (event) => {
      if (isCancellationEvent(event)) return true;

      const transparency = propValue(firstProp(event, "TRANSP")).toUpperCase();
      const { summary, description } = eventText(event);
      const combined = `${summary}\n${description}`;
      if (transparency === "TRANSPARENT" && !/<b>\s*(HOMEWORK|UNTIL NEXT LESSON)\s*<\/b>/i.test(description)) return true;
      if (/<b>\s*(Holidays|Message of the day)\s*<\/b>/i.test(description)) return true;
      if (/^\s*(Tag der|Ferien|Fachsprechstunde|Message of the day)/i.test(combined)) return true;
      return false;
    };

    const addOccurrence = (occurrences, event, start, end, excludedDays, excludedTimes, windowStart, windowEnd, blocks) => {
      if (!start || start < windowStart || start > windowEnd) return;
      if (excludedTimes.has(start.getTime()) || excludedDays.has(dayKey(start))) return;
      const { summary, description } = eventText(event);
      const match = matchCalendarSubject(summary, description);
      if (!match) return;
      if (isBlockedByWebUntisChange(match.subject, start, end, blocks)) return;
      occurrences.push({ subject: match.subject, summary, start, end });
    };

    const expandCalendarEvents = (events, now, lookaheadDays) => {
      const windowStart = new Date(now);
      const windowEnd = addDays(now, lookaheadDays);
      const occurrences = [];
      const recurrenceExclusions = {};
      const blocks = blockingEvents(events, windowStart, windowEnd);

      for (const event of events) {
        addRecurrenceExclusion(recurrenceExclusions, getEventUid(event), getRecurrenceId(event));
      }

      for (const event of events) {
        if (isCancelledOrNonLesson(event)) continue;

        const dtStartProp = firstProp(event, "DTSTART");
        const dtStart = parseIcsDate(propValue(dtStartProp), propParams(dtStartProp));
        if (!dtStart) continue;

        const dtEndProp = firstProp(event, "DTEND");
        const dtEnd = parseIcsDate(propValue(dtEndProp), propParams(dtEndProp));
        const durationMs = dtEnd && dtEnd > dtStart ? dtEnd.getTime() - dtStart.getTime() : 45 * 60 * 1000;
        const excludedDates = [];
        for (const exdateProp of (event.EXDATE || [])) excludedDates.push(...parseIcsDateList(exdateProp));
        const excludedTimes = new Set(excludedDates.map(d => d.getTime()));
        const excludedDays = new Set(excludedDates.map(dayKey));
        const rruleProp = firstProp(event, "RRULE");

        if (!rruleProp) {
          addOccurrence(occurrences, event, dtStart, new Date(dtStart.getTime() + durationMs), excludedDays, excludedTimes, windowStart, windowEnd, blocks);
          continue;
        }

        const rule = parseRRule(rruleProp.value);
        if (rule.FREQ !== "WEEKLY") continue;

        const eventExclusions = recurrenceExclusions[getEventUid(event)];
        if (eventExclusions) {
          for (const time of eventExclusions.times) excludedTimes.add(time);
          for (const day of eventExclusions.days) excludedDays.add(day);
        }

        const interval = Math.max(1, parseInt(rule.INTERVAL || "1", 10) || 1);
        const countLimit = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
        const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, {}) : null;
        const maxEnd = until && until < windowEnd ? until : windowEnd;
        const byDays = (rule.BYDAY ? rule.BYDAY.split(",") : [weekDayCode(dtStart)])
          .map(d => d.replace(/^[+-]?\d+/, "").toUpperCase())
          .filter(d => weekDayIndex(d) !== undefined)
          .sort((a, b) => weekDayIndex(a) - weekDayIndex(b));

        let generated = 0;
        let stop = false;
        for (let week = startOfWeek(dtStart); week <= maxEnd && !stop; week = addDays(week, interval * 7)) {
          for (const day of byDays) {
            const occurrenceStart = addDays(week, weekDayIndex(day));
            occurrenceStart.setHours(dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
            if (occurrenceStart < dtStart) continue;

            generated++;
            if (countLimit && generated > countLimit) { stop = true; break; }
            addOccurrence(
              occurrences,
              event,
              occurrenceStart,
              new Date(occurrenceStart.getTime() + durationMs),
              excludedDays,
              excludedTimes,
              windowStart,
              maxEnd,
              blocks
            );
          }
        }
      }

      return occurrences.sort((a, b) => a.start - b.start);
    };

    const findNextCalendarLesson = (subject, occurrences, now) => {
      return occurrences.find(occurrence => occurrence.subject === subject && occurrence.start > now) || null;
    };

    const nextTimetableLessonStart = (subject, today) => {
      const lessonDays = timetable[subject];
      if (!lessonDays || lessonDays.length === 0) return null;

      const currentDay = today.getDay();
      const sortedDays = [...lessonDays].sort((a, b) => a - b);
      let nextDay = sortedDays.find(d => d > currentDay);
      let daysUntil;
      if (nextDay !== undefined) {
        daysUntil = nextDay - currentDay;
      } else {
        nextDay = sortedDays[0];
        daysUntil = (7 - currentDay) + nextDay;
      }

      const lessonStart = new Date(today);
      lessonStart.setDate(today.getDate() + daysUntil);
      lessonStart.setHours(8, 0, 0, 0);
      return lessonStart;
    };

    const roundUpNow = (now) => {
      const out = new Date(now.getTime() + 5 * 60 * 1000);
      out.setSeconds(0, 0);
      return out;
    };

    const taskDateForLesson = (lessonStart, now) => {
      const taskDate = new Date(lessonStart);
      taskDate.setDate(taskDate.getDate() - 1);
      taskDate.setHours(HOMEWORK_START_HOUR, HOMEWORK_START_MINUTE, 0, 0);
      return taskDate > now ? taskDate : roundUpNow(now);
    };

    const formatDateTime = (date) => {
      return date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const sourceLabel = (source) => source === "calendar" ? "📅 calendar" : "🗓️ timetable";

    try {
      const targetUUID = app.context.noteUUID;
      const contentText = await getNoteText(targetUUID);
      if (!contentText) { await app.alert("❌ Could not read note."); return; }

      const homeworkItems = [];
      for (const line of contentText.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("- [") || trimmed.startsWith("[ ]")) continue;
        if (trimmed.startsWith("{") || trimmed.startsWith("-{")) continue;

        const homeworkItem = parseHomeworkLine(trimmed);
        if (!homeworkItem) continue;

        homeworkItems.push({ line, subject: homeworkItem.subject, homework: homeworkItem.homework });
      }

      if (homeworkItems.length === 0) {
        const reorderedText = reorderActiveTasks(contentText);
        if (reorderedText !== contentText) {
          await app.replaceNoteContent({ uuid: targetUUID }, reorderedText);
          await app.alert("ℹ️ No homework items found.\n\n✅ Reordered existing scheduled tasks.");
        } else {
          await app.alert("ℹ️ No homework items found.");
        }
        return;
      }

      const now = new Date();
      const warnings = [];
      const fallbackSubjects = new Set();
      const tasksCreated = [];
      const linesToRemove = [];
      let calendarOccurrences = [];
      let calendarAvailable = false;

      try {
        const proxyUrl = app.settings && app.settings[CALENDAR_PROXY_URL_SETTING_NAME];
        const proxyToken = app.settings && app.settings[CALENDAR_PROXY_TOKEN_SETTING_NAME];
        const icsText = await fetchCalendarText(proxyUrl, proxyToken);
        calendarOccurrences = expandCalendarEvents(parseIcsEvents(icsText), now, LOOKAHEAD_DAYS);
        calendarAvailable = true;
      } catch (err) {
        const origin = typeof window !== "undefined" && window.location ? window.location.origin : "unknown origin";
        warnings.push(`⚠️ Calendar proxy warning from ${origin}: ${err.message}. Using timetable fallback where possible.`);
      }

      for (const item of homeworkItems) {
        const { line, subject, homework } = item;
        let lessonStart = null;
        let source = "timetable";

        if (calendarAvailable) {
          const calendarLesson = findNextCalendarLesson(subject, calendarOccurrences, now);
          if (calendarLesson) {
            lessonStart = calendarLesson.start;
            source = "calendar";
          } else {
            fallbackSubjects.add(subject);
          }
        }

        if (!lessonStart) lessonStart = nextTimetableLessonStart(subject, now);
        if (!lessonStart) {
          warnings.push(`⚠️ No timetable fallback exists for ${subject}; skipped "${homework}".`);
          continue;
        }

        const taskDate = taskDateForLesson(lessonStart, now);
        const startAt = Math.floor(taskDate.getTime() / 1000);
        const duration = subjectDurations[subject] || 30;
        const endAt = startAt + duration * 60;

        try {
          await app.insertTask({ uuid: targetUUID }, { content: `${subject}: ${homework}`, startAt, endAt });
          tasksCreated.push(`✅ ${subject}: ${homework} (${duration}m, ${sourceLabel(source)}, due ${formatDateTime(taskDate)})`);
          linesToRemove.push(line);
        } catch (err) {
          console.error(`Failed to create task for ${subject}:`, err);
          warnings.push(`❌ Failed to create ${subject} task: ${err.message}`);
        }
      }

      if (fallbackSubjects.size > 0) {
        warnings.push(`⚠️ No matching calendar lesson found for: ${sortMessages([...fallbackSubjects]).join(", ")}. Used timetable fallback.`);
      }

      const summaryParts = [];
      if (tasksCreated.length > 0) {
        summaryParts.push(`✅ Created ${tasksCreated.length} task(s):\n\n${tasksCreated.join("\n")}`);
      } else {
        summaryParts.push("ℹ️ No tasks were created.");
      }
      if (warnings.length > 0) summaryParts.push(`⚠️ Warnings:\n${warnings.join("\n")}`);
      await app.alert(summaryParts.join("\n\n"));

      const currentText = await getNoteText(targetUUID);
      const cleanedText = removeCreatedHomeworkLines(currentText, linesToRemove);
      const reorderedText = reorderActiveTasks(cleanedText);
      if (reorderedText !== cleanedText || cleanedText !== currentText) {
        await app.replaceNoteContent({ uuid: targetUUID }, reorderedText);
      }

    } catch (error) {
      console.error(error);
      await app.alert("❌ Error: " + error.message);
    }
  }
}
```
