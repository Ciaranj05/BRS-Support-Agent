# Intent-Frame Accuracy Summary

Scored: 2026-07-03T12:14:59.913Z
Source commit: 4071ff86a193f99b3b7761f1cf3aa672271e696c
Response set: live-chatbot-results-intent-frame-2026-07-03 representative subset

Weighted end-user accuracy: 93.5
Unweighted end-user accuracy: 93
Weighted functional accuracy: 94
Weighted response quality: 90.1
Release pass count (90+): 25/30
Critical blockers: 0
HTTP failures: 0

## Four Reported-Failure Probes

Incident-probe end-user accuracy: 88.5
Incident-probe pass count (90+): 3/4
Raw backend errors: 0

- I001 (Tools / System Configuration) 94: Correctly answers with System Configuration and buggy availability settings; actionable enough for staff.
- I002 (Optional integrations / Club Systems) 90: Correctly avoids the wrong CSV workflow and explains the optional integration/demo-system limitation with escalation.
- I003 (Green Fee Rates) 92: Correctly distinguishes Tools > Green Fee Rates from visitor/Tee Time Agent rates and asks a useful brief clarification.
- I004 (Timesheet / Check-in) 78: Major improvement from a 500 error, but still not a resolved workflow because the approved check-in evidence is missing.

## Below 90 In Main Benchmark

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