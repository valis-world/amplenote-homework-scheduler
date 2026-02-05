| | |
|-|-|
|name<!-- {"cell":{"colwidth":102}} -->|amplenote-homework-scheduler|
|icon<!-- {"cell":{"colwidth":102}} -->|school|
|description<!-- {"cell":{"colwidth":102}} -->|An Amplenote plugin that converts plain text homework notes into scheduled tasks.|
|instructions<!-- {"cell":{"colwidth":102}} -->|Homework Note UUID|
```javascript
{
  async noteOption(app) {
    // Day: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
    const timetable = {
      "Mathe": [1, 3, 5],
      "Physik": [3, 4],
      "Musik": [2],
      "Deutsch": [2, 4],
      "Geschichte": [2, 5],
      "Geographie": [3, 5],
      "Latein": [1, 3],
      "Englisch": [2, 5],
      "Biologie": [1, 3],
      "Informatik": [5],
      "Chemie": [1, 4],
      "Religion": [2],
      "Wirtschaft und Recht": [1]
    };
    // Subject name aliases
    const subjectMap = {
      "Mathe": ["mathe", "math", "ma"],
      "Physik": ["physik", "phy", "ph"],
      "Musik": ["musik", "mus", "mu"],
      "Deutsch": ["deutsch", "deu", "ger", "de"],
      "Geschichte": ["geschichte", "ges", "his", "hist"],
      "Geographie": ["geographie", "geo", "erdkunde"],
      "Latein": ["latein", "lat", "la"],
      "Englisch": ["englisch", "eng", "en"],
      "Biologie": ["biologie", "bio", "bi"],
      "Informatik": ["informatik", "info", "inf", "it", "cs"],
      "Chemie": ["chemie", "che", "ch"],
      "Religion": ["religion", "rel", "reli"],
      "Wirtschaft und Recht": ["wirtschaft und recht", "wirtschaft", "wr", "w+r", "econ"]
    };
    // Estimated homework duration per subject (minutes)
    const subjectDurations = {
      "Mathe": 30, 
      "Physik": 30, 
      "Musik": 30, 
      "Deutsch": 45, 
      "Geschichte": 30,
      "Geographie": 20, 
      "Latein": 40, 
      "Englisch": 30, 
      "Biologie": 30,
      "Informatik": 10, 
      "Chemie": 30, 
      "Religion": 30, 
      "Wirtschaft und Recht": 20
    };

    const targetUUID = "10a28978-9d4d-11f0-867c-3f8703bd8603";

    // Extract text content from nested note structure
    const extractText = (node) => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (node.type === 'text' && node.text) return node.text;
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('');
      }
      return '';
    };

    // Helper: Get plain text from note content
    const getNoteText = async (uuid) => {
      const content = await app.getNoteContent({ uuid });
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (content.content && Array.isArray(content.content)) {
        return content.content.map(extractText).join('\n');
      }
      return extractText(content);
    };

    // Helper: Reorder all active (unchecked) task lines in a raw note string.
    // Moves the sorted block to the position of the first active task found.
    const reorderActiveTasks = (raw) => {
      if (typeof raw !== 'string') return raw;
      const lines = raw.split('\n');
      const activeEntries = [];
      const activeIndices = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- [ ]')) {
          activeEntries.push(lines[i]);
          activeIndices.push(i);
        }
      }
      if (activeEntries.length <= 1) return raw;

      const parseStartAt = (line) => {
        const m = line.match(/"startAt"\s*:\s*(\d+)/);
        return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
      };

      const sorted = activeEntries.slice().sort((a, b) => parseStartAt(a) - parseStartAt(b));
      const firstIndex = Math.min(...activeIndices);

      const out = [];
      let inserted = false;
      for (let i = 0; i < lines.length; i++) {
        if (i === firstIndex && !inserted) {
          out.push(...sorted);
          inserted = true;
        }
        if (lines[i].trim().startsWith('- [ ]')) {
          // skip original active lines (they're in sorted block)
          continue;
        }
        out.push(lines[i]);
      }
      return out.join('\n');
    };

    try {
      const contentText = await getNoteText(targetUUID);
      if (!contentText) {
        await app.alert("❌ Could not read Homework note.");
        return;
      }
      const lines = contentText.split('\n');
      const tasksCreated = [];
      const linesToRemove = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and existing tasks
        if (!trimmed || trimmed.startsWith("- [ ]") || trimmed.startsWith("[ ]")) continue;

        const lowerLine = trimmed.toLowerCase();

        // Try to match this line to a subject
        subjectLoop: for (const [subject, triggers] of Object.entries(subjectMap)) {
          const allTriggers = [subject.toLowerCase(), ...triggers];

          for (const trigger of allTriggers) {
            if (lowerLine.startsWith(trigger)) {
              const charAfter = lowerLine[trigger.length];
              // Ensure trigger is word boundary
              if (!charAfter || [" ", ":", "-", "."].includes(charAfter)) {
                
                let homework = trimmed.substring(trigger.length).trim();
                homework = homework.replace(/^[:\-\s]+/, "");
                
                // Get lesson schedule for this subject
                const lessonDays = timetable[subject];
                if (!lessonDays || lessonDays.length === 0) break subjectLoop;

                // Calculate task date (1 day before next lesson)
                const today = new Date();
                const currentDay = today.getDay();
                const sortedDays = lessonDays.sort((a, b) => a - b);
                
                let nextDay = sortedDays.find(d => d > currentDay);
                let daysUntil = 0;
                
                if (nextDay !== undefined) {
                  daysUntil = nextDay - currentDay;
                } else {
                  nextDay = sortedDays[0];
                  daysUntil = (7 - currentDay) + nextDay;
                }

                const taskDate = new Date(today);
                taskDate.setDate(today.getDate() + daysUntil - 1);
                taskDate.setHours(17, 0, 0, 0); // 5 PM
                
                const startAt = Math.floor(taskDate.getTime() / 1000);
                const duration = subjectDurations[subject] || 30;
                const endAt = startAt + (duration * 60);
                
                try {
                  await app.insertTask({ uuid: targetUUID }, {
                    content: `${subject}: ${homework}`,
                    startAt,
                    endAt
                  });
                  tasksCreated.push(`✅ ${subject} - ${homework} (${duration}m)`);
                  linesToRemove.push(line);
                  break subjectLoop;
                } catch (error) {
                  console.error(`Failed to create task for ${subject}:`, error);
                  tasksCreated.push(`❌ ${subject}: ${error.message}`);
                  break subjectLoop;
                }
              }
            }
          }
        }
      }
      // (no-op) postpone reordering until we've computed cleaned content to avoid extra I/O
      // Show results
      const message = tasksCreated.length > 0 
        ? `✅ Created ${tasksCreated.length} tasks:\n\n${tasksCreated.join('\n')}`
        : "⚠️ No homework items found";
      await app.alert(message);
      
      // Read the current note (so newly-inserted task lines are preserved),
      // remove the original processed lines, then reorder and write once.
      const currentText = await getNoteText(targetUUID);
      const currentLines = currentText.split(/\r?\n/);
      const removals = new Set(linesToRemove.map(l => l.trim()));
      const cleanedLines = currentLines.filter(l => !removals.has(l.trim()));
      const cleanedText = cleanedLines.join('\n');

      // Reorder active tasks on the cleaned text and write back only once if changed
      const reorderedText = reorderActiveTasks(cleanedText);
      if (reorderedText !== currentText) {
        await app.replaceNoteContent({ uuid: targetUUID }, reorderedText);
      }
      
    } catch (error) {
      console.error(error);
      await app.alert("❌ Error: " + error.message);
    }
  }
}
```

\