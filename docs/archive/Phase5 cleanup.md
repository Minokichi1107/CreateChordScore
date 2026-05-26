Phase5 cleanup.

Check app.js and move remaining UI event listeners into setupEventHandlers().

Targets:

Replace UI
- rb-find
- rb-replace
- rb-all
- rb-focus
- rb-next
- rb-prev
- rb-one
- rb-all-btn
- rb-undo
- rb-close
- btn-replace-open

Project meta
- project-title
- proj-key
- proj-bpm

Also check:
- btnAddDiagBottom click event

Remove HTML onclick attributes in index.html:
- audio-btn
- chord-btn

Register them in setupEventHandlers() instead.

Do NOT move:
- dynamically created DOM events
- modal internal events
- events in editor.js or audio.js