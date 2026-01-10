# Amplenote Homework Scheduler

An Amplenote plugin that converts plain text homework notes into scheduled tasks.

## What it does

This plugin scans plain text notes for subject keywords (e.g. `Mathe`, including abbreviations and common misspellings) and automatically creates scheduled tasks in Amplenote.

The due date is determined by looking up the **next upcoming lesson** for that subject.

---

## Example

Given the following plain text in a note:

Deutsch Aufgabe 1  
Mathe S. 42 Nr. 3  
Eng Hausaufgabe Vokabeln


The plugin will:

- Detect the subject from each line (including abbreviations and common misspellings)
- Normalize the subject to its **formal subject name**
- Look up the **next upcoming lesson** for that subject
- Create scheduled tasks in Amplenote

Resulting tasks (example):

- **Deutsch: Aufgabe 1** → due on *next Deutsch lesson*
- **Mathematik: S. 42 Nr. 3** → due on *next Mathematik lesson*
- **Englisch: Hausaufgabe Vokabeln** → due on *next Englisch lesson*

---

## Installation

This plugin is distributed as a single Markdown file.

1. Open the file  
   **`amplenote-homework-scheduler.md`** in this repository.

2. Copy **the entire contents** of the file.

3. In Amplenote:
   - Create a new note
   - Open the **three-dots menu (⋮)** in the top right
   - Select **“Edit Markdown”**
   - Paste the copied content
   - Save the note

4. Activate the plugin by following the **official Amplenote plugin documentation**:  
   https://www.amplenote.com/help/plugins

---

## Current state

- Subject recognition with abbreviations and fuzzy matching
- Hardcoded timetable for lesson lookup
- Automatic task creation from plain text notes

---

## Planned features

- Integration with WebUntis (via an existing Google Calendar sync)
- Dynamic timetable lookup instead of hardcoded data
- Full integration using the Amplenote Plugin API

---

## Use case

Built primarily for managing school homework, but can be adapted for any subject-based scheduling workflow.

---

## Status

🚧 Work in progress  
Expect breaking changes as WebUntis and Amplenote API integration is added.

---

Feel free to open issues or contribute ideas!
