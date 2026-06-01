# Vaccination v60 patch

Scope: vaccination module only. MCU Corporate and CAPASKA files are not changed.

Changes:
- Session auto-generation groups by location + date only, not time slot.
- Session dropdown labels are shortened to event + location + date.
- Import participants from vaccination import rows matches location + date, so all time slots at the same location/date merge into one session.
- Registration product dropdowns use vaccines configured on the selected session first.
- Registration adds product count cards and search by name / employee ID / NIK.
- Queue and Administer session dropdown labels are shortened.
- Administer Done button is blue when Not Done, white/disabled after Done.
- Sticker printing is opened through a pre-opened window so Done + Print responds more reliably.
- Doctor/petugas name is no longer blocking on the client; backend will use logged-in user/system fallback.

No new SQL is required if v57 SQL has been run. Existing old sessions generated per time slot should be deleted/regenerated if you want the shorter location+date grouping.
