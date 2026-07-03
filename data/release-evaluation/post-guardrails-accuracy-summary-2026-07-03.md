# Post-Guardrails Accuracy Summary

Scored: 2026-07-03T10:45:50.622Z
Source commit: 6c6a76a5311103c3c0dac032b7873415dfff95dd
Response set: live-chatbot-results-post-guardrails-2026-07-03 representative subset

Weighted end-user accuracy: 93.5
Unweighted end-user accuracy: 93
Weighted functional accuracy: 94
Weighted response quality: 90.1
Release pass count (90+): 25/30
Critical blockers: 0
HTTP failures: 0

## Below 90

- Q001 (Timesheet) 89: Correct workflow and usable steps, but the generated text has a visible grammar break and uses "Add" awkwardly rather than clearly saying to click Add/Save.
- Q024 (Users) 80: Identifies member registration/enabling route, but is too thin for staff creating a new member login: missing membership type/privileges and detailed verification steps.
- Q028 (Facilities) 86: Correct Facilities route and core fields, but misses the Add action and opening the booking for extra details.
- Q034 (Competitions) 81: Safely routes to Open Competitions for Visitors, but misses key visitor-entry details such as handicap/CDH capture, payment if enabled, and confirmation email.
- Q038 (Guest Rates) 84: Correct policy boundary and guest/visitor pricing setup check, but includes generic foul-weather/legal-message wording and lacks advice on explaining club policy/value to the member.

## Gate

- weightedEndUserAccuracy90Plus: true
- functionalAccuracy92Plus: true
- responseQuality85Plus: true
- criticalBlockersZero: true
- highRiskPassRate90Is100: false
- commonWorkflowPassRate90AtLeast90: false
- httpServerFailuresZero: true
- overall: false
