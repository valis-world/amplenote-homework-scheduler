| | |
|-|-|
|name<!-- {"cell":{"colwidth":102}} -->|amplenote-homework-scheduler|
|icon<!-- {"cell":{"colwidth":102}} -->|school|
|description<!-- {"cell":{"colwidth":102}} -->|An Amplenote plugin that converts plain text homework notes into scheduled tasks.|
|instructions<!-- {"cell":{"colwidth":102}} -->|Run this from the note that contains your plain-text homework lines. Each line should start with a subject name or alias, followed by the homework text.|
```javascript
{
  async noteOption(app, noteUUID) {
    // Configuration. Timetable day numbers are 1=Mon through 7=Sun.
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
      "Mathe":                ["mathe", "math"],
      "Physik":               ["physik", "phy"],
      "Musik":                ["musik", "mus"],
      "Deutsch":              ["deutsch", "deu", "ger"],
      "Geschichte":           ["geschichte", "ges", "his", "hist"],
      "Geographie":           ["geographie", "geo", "erdkunde"],
      "Latein":               ["latein", "lat"],
      "Englisch":             ["englisch", "eng"],
      "Biologie":             ["biologie", "bio"],
      "Informatik":           ["informatik", "info", "inf"],
      "Chemie":               ["chemie", "che"],
      "Religion":             ["religion", "rel", "reli", "katholisch", "kath"],
      "Wirtschaft und Recht": ["wirtschaft und recht", "wirtschaft", "econ", "wur"],
      "PuG":                  ["pug", "politik", "gesellschaft", "politik und gesellschaft"],
      "Sport":                ["sport", "spo"],
      "Kunst":                ["kunst"],
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

    const charSimilarity = (a, b) => {
      a = a.toLowerCase().replace(/\s+/g, "");
      b = b.toLowerCase().replace(/\s+/g, "");
      if (a === b) return 1.0;
      if (a.includes(b) || b.includes(a)) return 0.92;
      const pool = b.split("");
      let matches = 0;
      for (const ch of a) {
        const idx = pool.indexOf(ch);
        if (idx !== -1) { matches++; pool.splice(idx, 1); }
      }
      return matches / Math.max(a.length, b.length);
    };

    const HOMEWORK_START_HOUR = 17;
    const MATCH_THRESHOLD = 0.70;
    const MIN_FUZZY_TOKEN_LENGTH = 3; // from v2

    const stripHtmlComments = (line) => line.replace(/<!--[\s\S]*?-->/g, "").trim();
    const looksLikeSubjectToken = (token) =>
      token.length >= MIN_FUZZY_TOKEN_LENGTH && /^[A-Za-zÄÖÜäöüß+&]{3,}$/.test(token);

    const extractToken = (line) => {
      const trimmed = line.trim();
      const sep = trimmed.search(/[:-]/);
      return sep !== -1 ? trimmed.slice(0, sep).trim() : trimmed.split(/\s+/)[0];
    };

    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const aliasRegex = (value) => {
      const pattern = value.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
      return new RegExp(`^${pattern}(?=$|[\\s:.-])`, "i");
    };

    const matchSubject = (line) => {
      const trimmed = line.trim();
      let bestExact = null;
      for (const [subject, aliases] of Object.entries(subjectAliases)) {
        for (const form of [subject, ...aliases]) {
          const match = trimmed.match(aliasRegex(form));
          if (match && (!bestExact || match[0].length > bestExact.prefix.length)) {
            bestExact = { subject, prefix: match[0], score: 1.0 };
          }
        }
      }
      if (bestExact) return bestExact;

      // Fuzzy matching only uses the first token to avoid catching normal prose.
      const token = extractToken(line);
      if (!token) return null;
      if (!looksLikeSubjectToken(token)) return null;
      let best = null;
      let bestScore = 0;
      for (const [subject, aliases] of Object.entries(subjectAliases)) {
        for (const form of [subject, ...aliases]) {
          const score = charSimilarity(token, form);
          if (score > bestScore) { bestScore = score; best = subject; }
        }
      }
      return bestScore >= MATCH_THRESHOLD ? { subject: best, prefix: token, score: bestScore } : null;
    };

    const nextHomeworkWindow = (subject) => {
      const lessonDays = timetable[subject];
      if (!lessonDays || lessonDays.length === 0) return null;

      const now = new Date();
      const currentDay = now.getDay();
      const sortedDays = [...lessonDays].sort((a, b) => a - b);
      const nextDay = sortedDays.find(d => d > currentDay) || sortedDays[0];
      const daysUntil = nextDay > currentDay ? nextDay - currentDay : (7 - currentDay) + nextDay;

      const startDate = new Date(now);
      startDate.setDate(now.getDate() + daysUntil - 1);
      startDate.setHours(HOMEWORK_START_HOUR, 0, 0, 0);
      if (startDate.getTime() < now.getTime()) {
        startDate.setTime(now.getTime());
      }

      const duration = subjectDurations[subject] || 30;
      const startAt = Math.floor(startDate.getTime() / 1000);
      return { startAt, endAt: startAt + duration * 60, duration };
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

    const getNoteTasks = async (uuid) => {
      try {
        return await app.getNoteTasks({ uuid });
      } catch (err) {
        console.error("Could not read note tasks for sorting:", err);
        return [];
      }
    };

    const normalizeTaskText = (text) => String(text || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\[\^\d+\]:\s*\[.*?\]\(\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const taskStartLookup = (tasks) => {
      const lookup = new Map();
      for (const task of tasks || []) {
        if (!task || !task.startAt || task.completedAt || task.dismissedAt) continue;
        const key = normalizeTaskText(task.content);
        if (!key) continue;
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(task.startAt);
      }
      for (const values of lookup.values()) values.sort((a, b) => a - b);
      return lookup;
    };

    const reorderActiveTasks = (raw, tasks = []) => {
      if (typeof raw !== "string") return { text: raw, movedCount: 0, sortableCount: 0 };
      const lines = raw.split("\n");

      const isActiveTask = (line) => {
        const trimmed = line.trim();
        return /^[-*]\s+\[\s\]/.test(trimmed) || /\]check_box_outline_blank\b/.test(trimmed);
      };
      const isDoneTask = (line) => {
        const trimmed = line.trim();
        return /^[-*]\s+\[[xX]\]/.test(trimmed) || /\]check_box\b/.test(trimmed);
      };

      const isTaskMetadata = (line) => {
        const trimmed = line.trim();
        return trimmed.startsWith("<!--") || trimmed.startsWith("{");
      };
      const visibleTaskText = (entry) => {
        const line = entry[0].trim();
        const bracketTask = line.match(/^\[(.+?)\]check_box_outline_blank\b/);
        const markdownTask = line.match(/^[-*]\s+\[\s\]\s*(.*)$/);
        return normalizeTaskText((bracketTask && bracketTask[1]) || (markdownTask && markdownTask[1]) || line);
      };

      // Prefer Amplenote task data for dates; markdown may not include startAt.
      const lookup = taskStartLookup(tasks);
      const parseStartAt = (entry) => {
        const text = entry.join("\n");
        const m = text.match(/"?startAt"?\s*:\s*"?(\d+)"?/);
        if (m) return parseInt(m[1], 10);
        const matches = lookup.get(visibleTaskText(entry));
        return matches && matches.length > 0 ? matches.shift() : Number.POSITIVE_INFINITY;
      };

      const items = [];
      const sortableTasks = [];
      let firstSortableIndex = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isActiveTask(line)) {
          const entry = [line];
          while (i + 1 < lines.length && isTaskMetadata(lines[i + 1])) {
            entry.push(lines[i + 1]);
            i++;
          }
          const startAt = parseStartAt(entry);
          const item = { entry, startAt };
          items.push(item);
          if (Number.isFinite(startAt)) {
            if (firstSortableIndex === null) firstSortableIndex = items.length - 1;
            sortableTasks.push(item);
          }
        } else if (isDoneTask(line)) {
          const entry = [line];
          while (i + 1 < lines.length && isTaskMetadata(lines[i + 1])) {
            entry.push(lines[i + 1]);
            i++;
          }
          items.push({ entry });
        } else {
          items.push({ entry: [line] });
        }
      }

      if (sortableTasks.length <= 1 || firstSortableIndex === null) {
        return { text: raw, movedCount: 0, sortableCount: sortableTasks.length };
      }

      const sortedTasks = sortableTasks
        .map((task, index) => ({ task, index }))
        .sort((a, b) => (a.task.startAt - b.task.startAt) || (a.index - b.index))
        .map(({ task }) => task);

      const movedCount = sortedTasks.reduce(
        (count, task, index) => count + (task === sortableTasks[index] ? 0 : 1),
        0
      );
      if (movedCount === 0) {
        return { text: raw, movedCount: 0, sortableCount: sortableTasks.length };
      }

      const sortedTaskSet = new Set(sortableTasks);
      const out = [];
      let insertedSortedTasks = false;
      for (let i = 0; i < items.length; i++) {
        if (i === firstSortableIndex && !insertedSortedTasks) {
          for (const task of sortedTasks) out.push(...task.entry);
          insertedSortedTasks = true;
        }
        if (sortedTaskSet.has(items[i])) continue;
        out.push(...items[i].entry);
      }

      return { text: out.join("\n"), movedCount, sortableCount: sortableTasks.length };
    };

    try {
      const targetUUID = noteUUID || (app.context && app.context.noteUUID);
      if (!targetUUID) { await app.alert("Could not determine which note to update."); return; }

      const contentText = await getNoteText(targetUUID);
      if (!contentText) { await app.alert("Could not read note."); return; }

      const taskResults = [];
      const linesToRemove = [];
      let createdCount = 0;
      let failedCount = 0;

      for (const line of contentText.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("- [") || trimmed.startsWith("[ ]")) continue;
        if (trimmed.startsWith("{") || trimmed.startsWith("-{")) continue;

        const sourceLine = stripHtmlComments(trimmed.replace(/^[-*]\s+/, ""));
        if (!sourceLine) continue;

        const match = matchSubject(sourceLine);
        if (!match) continue;

        const { subject, prefix, score } = match;
        const matchPercent = Math.round(score * 100);
        const homework = sourceLine.slice(prefix.length).replace(/^[:.\s-]+/, "").trim();
        if (!homework) continue;

        const schedule = nextHomeworkWindow(subject);
        if (!schedule) continue;

        try {
          await app.insertTask(
            { uuid: targetUUID },
            { content: `${subject}: ${homework}`, startAt: schedule.startAt, endAt: schedule.endAt }
          );
          createdCount++;
          taskResults.push(`✅ ${subject} — ${homework} (${schedule.duration}m, ${matchPercent}% match)`);
          linesToRemove.push(line);
        } catch (err) {
          console.error(`Failed to create task for ${subject}:`, err);
          failedCount++;
          taskResults.push(`❌ ${subject} (${matchPercent}% match): ${err && err.message ? err.message : String(err)}`);
        }
      }

      // Re-fetch after insertTask calls so new task lines are present,
      // then remove the original plain-text lines and reorder by start time.
      const currentText = createdCount > 0 ? await getNoteText(targetUUID) : contentText;
      const removals = new Map();
      for (const line of linesToRemove) {
        const key = line.trim();
        removals.set(key, (removals.get(key) || 0) + 1);
      }
      const cleanedText = currentText.split(/\r?\n/)
        .filter(l => {
          const key = l.trim();
          const remaining = removals.get(key) || 0;
          if (remaining === 0) return true;
          removals.set(key, remaining - 1);
          return false;
        })
        .join("\n");

      const noteTasks = await getNoteTasks(targetUUID);
      const reorderResult = reorderActiveTasks(cleanedText, noteTasks);
      if (reorderResult.text !== currentText) {
        await app.replaceNoteContent({ uuid: targetUUID }, reorderResult.text);
      }

      const summary = [
        `Created ${createdCount} task(s)${failedCount ? `, failed ${failedCount}` : ""}.`,
        reorderResult.movedCount > 0
          ? `Reordered ${reorderResult.movedCount} scheduled task(s).`
          : `No reorder needed${reorderResult.sortableCount ? ` (${reorderResult.sortableCount} scheduled task(s) checked)` : ""}.`,
      ];
      await app.alert(
        taskResults.length > 0
          ? `${summary.join("\n")}\n\n${taskResults.join("\n")}`
          : summary.join("\n")
      );

    } catch (error) {
      console.error(error);
      await app.alert("Error: " + (error && error.message ? error.message : String(error)));
    }
  }
}
```

\
