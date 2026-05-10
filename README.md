# Amplenote Homework Scheduler

An Amplenote plugin that turns plain-text homework lines into scheduled tasks in the same note.

## What It Does

Run the plugin from a homework note. It scans each non-task line, detects the subject at the start, creates an Amplenote task, and removes the original plain-text line after the task is created successfully.

The task is scheduled for 17:00 on the day before the next lesson for that subject. If that time has already passed, it schedules the task for the current time instead. Existing unchecked scheduled tasks in the note are sorted by their `startAt` timestamp after each run, even when no new homework lines are found.

## Example

**Input in a note:**

![Input note with homework lines](images/input-note.png)

**Resulting tasks:**

![Resulting scheduled tasks](images/resulting-tasks.png)

The exact dates depend on the timetable configured in `amplenote-homework-scheduler.md`.

## Supported Input

Each homework line should start with a subject name or alias, followed by the homework text.

Aliases are intentionally at least three characters long to avoid accidental matches in normal text.

Supported separators:

- `Mathe S. 42`
- `Mathe: S. 42`
- `Mathe - S. 42`

Existing task lines such as `- [ ] ...` and checked tasks are skipped.

## Configuration

All configuration currently lives inside the plugin code:

- `timetable`: lesson days per subject, using `1=Mon` through `7=Sun`
- `subjectAliases`: accepted names and abbreviations for each subject
- `subjectDurations`: estimated task duration in minutes
- `HOMEWORK_START_HOUR`: scheduled start hour, currently `17`

To adapt the plugin, edit those objects in `amplenote-homework-scheduler.md`.

The most useful places to edit are the three objects at the top of the plugin code: `timetable`, `subjectAliases`, and `subjectDurations`.

## Installation

1. Create a new note in Amplenote.
2. Open the note's markdown editor.
3. Paste the full contents of `amplenote-homework-scheduler.md`.
4. Enable that note as a plugin from Amplenote's plugin settings.

Official docs: https://www.amplenote.com/help/developing_amplenote_plugins/plugin_creation

## Usage

1. Open the note containing homework lines.
2. Go to a new line and run /home-work-scheduler
3. Review the result alert.

The plugin uses the note where it was invoked. It does not require a hardcoded homework note UUID.

## Current Limitations

- The timetable is hardcoded.
- It does not sync from WebUntis or Google Calendar yet.
- Fuzzy subject matching is intentionally simple and may still need tuning.

## Planned Improvements

- Dynamic timetable lookup from an external source.
- Optional settings for timetable and default task time.
- More robust tests around subject matching and date calculation.
