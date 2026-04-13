# Dashboard Stats Reference

Complete inventory of every possible stat and informational combination derivable from the codebase.
Each stat is marked with its implementation status and location(s).

**Legend:**
- `[x]` = Implemented (rendered in UI)
- `[ ]` = Not implemented anywhere
- `[~]` = Dashboard-only / needs new page / computed-only (no natural home page or not rendered)
- Location = file path(s) where the stat is currently rendered

**Display formats:** ~90% of implemented stats use **pill-based** UI (`rounded-full` spans in insight strips, `StatChip` components, or compact `rounded-xl` tiles inside grids) rather than full cards. This keeps the UI dense and scannable.

**Data sources:** `/api/attendance` (presence, trend, session, detail, daily, monthly, team-monthly, team-date), `/api/tasks`, `/api/campaigns`, `/api/departments`, `/api/employees`, `/api/leaves`, `/api/leaves/balance`, `/api/payroll/estimate`, `/api/payroll/bank-sheet`, `/api/payroll/payslips`, `/api/payroll/holidays`, `/api/payroll/config`, `/api/activity-logs`, `/api/location-flags`, `/api/ping`, `/api/user/last-seen`, `/api/organization/scope`

---

## 1. Attendance — Personal (Self) — Today

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 1 | Today's total working minutes | [x] | `DashboardHome.tsx`, `EmployeeCard.tsx`, `SessionTracker.tsx` |
| 2 | Today's office minutes | [x] | `DashboardHome.tsx`, `EmployeeCard.tsx` |
| 3 | Today's remote minutes | [x] | `DashboardHome.tsx`, `EmployeeCard.tsx` |
| 4 | Office vs Remote % split today | [x] | `DashboardHome.tsx` (self card bar) |
| 5 | Today's session count | [x] | `EmployeeCard.tsx` ("N sessions") |
| 6 | Clock-in time | [x] | `DashboardHome.tsx` (self card) |
| 7 | Clock-out time | [x] | `DashboardHome.tsx` (self card) |
| 8 | First office entry | [x] | `DashboardHome.tsx`, `EmployeeCard.tsx` |
| 9 | Last office exit | [x] | `DashboardHome.tsx`, `EmployeeCard.tsx` |
| 10 | On-time today? | [x] | `DashboardHome.tsx` (status badge) |
| 11 | Late by (minutes) | [x] | `EmployeeCard.tsx` ("+Xm late" chip) |
| 12 | Break minutes today | [x] | `insights-desk/attendance/page.tsx` (detail pill "X break") |
| 13 | Shift progress % | [x] | `DashboardHome.tsx` (self card progress bar) |
| 14 | Time remaining in shift | [~] | Dashboard-only |
| 15 | Is session stale? | [x] | `SessionTracker.tsx` ("inactive" label) |
| 16 | Location flagged? | [x] | `SessionTracker.tsx`, `EmployeeCard.tsx` |
| 17 | Hours worked so far (formatted) | [x] | `DashboardHome.tsx` (self card) |
| 18 | Elapsed time since clock-in | [~] | Dashboard-only |
| 19 | Expected clock-out time | [~] | Dashboard-only |
| 20 | Minutes until shift ends | [~] | Dashboard-only |
| 21 | Is currently in office vs remote | [x] | `SessionTracker.tsx` (location state) |
| 22 | Current session duration | [x] | `SessionTracker.tsx` (live timer) |
| 23 | Today's office segment count | [x] | `insights-desk/attendance/page.tsx` (session segments list) |
| 24 | Longest office segment today | [x] | `insights-desk/attendance/page.tsx` (session header pill "longest seg Xh Ym") |
| 25 | Today's idle/gap time | [~] | Dashboard-only |

## 2. Attendance — Monthly Personal

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 26 | Present days | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 27 | Total working days | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 28 | Present days / Total working days ratio | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 29 | Absent days | [x] | `insights-desk/attendance/page.tsx` (StatChip "Absent Xd") |
| 30 | On-time arrivals count | [x] | `insights-desk/attendance/page.tsx` (StatChip "On-Time Arrivals") |
| 31 | Late arrivals count | [x] | `insights-desk/attendance/page.tsx` (StatChip "Late Arrivals") |
| 32 | On-time % | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 33 | Attendance % | [x] | `insights-desk/attendance/page.tsx` (StatChip "Attendance X%") |
| 34 | Average daily hours | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 35 | Total working hours (month) | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 36 | Total office hours (month) | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 37 | Total remote hours (month) | [x] | `DashboardHome.tsx`, `insights-desk/attendance/page.tsx` |
| 38 | Office vs Remote hours % | [x] | `DashboardHome.tsx` (bar + labels) |
| 39 | Average office-in time | [x] | `insights-desk/attendance/page.tsx` (StatChip "Avg Office In") |
| 40 | Average office-out time | [x] | `insights-desk/attendance/page.tsx` (StatChip "Avg Office Out") |
| 41 | Days late this month | [x] | `insights-desk/attendance/page.tsx` (employee pill, overview card) |
| 42 | Days late to office this month | [x] | `insights-desk/attendance/page.tsx` (employee overview bottom row) |
| 43 | Total late minutes this month | [x] | `insights-desk/attendance/page.tsx` (personal insights pill "Xh Ym total late") |
| 44 | Average late minutes (when late) | [x] | `insights-desk/attendance/page.tsx` (pill "avg Xm when late") |
| 45 | Perfect attendance days | [x] | `insights-desk/attendance/page.tsx` (pill "N perfect days") |
| 46 | Average session count per day | [~] | Needs session-level aggregation |
| 47 | Most productive day of week | [x] | `insights-desk/attendance/page.tsx` (pill "Best: Mon (Xh Ym)") |
| 48 | Least productive day of week | [x] | `insights-desk/attendance/page.tsx` (pill "Least: Fri (Xh Ym)") |
| 49 | Days exceeding shift target | [~] | Needs shift config per user |
| 50 | Days below shift target | [~] | Needs shift config per user |
| 51 | Average break time per day | [x] | `insights-desk/attendance/page.tsx` (pill "avg Xm break") |
| 51a | Longest present streak (days) | [x] | `insights-desk/attendance/page.tsx` (pill "Nd present streak") |
| 51b | Max hours in a single day | [x] | `insights-desk/attendance/page.tsx` (pill "Best: Xh on date") |
| 51c | Min hours in a single day | [x] | `insights-desk/attendance/page.tsx` (pill "Min: Xh on date") |
| 51d | Remote-only days count | [x] | `insights-desk/attendance/page.tsx` (pill "N remote-only") |
| 51e | Office-only days count | [x] | `insights-desk/attendance/page.tsx` (pill "N office-only") |
| 51f | On-time streak (consecutive) | [x] | `insights-desk/attendance/page.tsx` (pill "Nd on-time streak") |
| 52 | Month-over-month change in attendance % | [~] | Dashboard-only (needs prev month data) |
| 53 | Month-over-month change in on-time % | [~] | Dashboard-only |
| 54 | Month-over-month change in avg daily hours | [~] | Dashboard-only |

## 3. Weekly Personal

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 55 | Per-day working minutes (7 days) | [x] | `DashboardHome.tsx` (weekly strip cards) |
| 56 | Per-day office vs remote split | [~] | Dashboard-only |
| 57 | Per-day on-time status | [x] | `DashboardHome.tsx` (dot colors on weekly strip) |
| 58 | Days present this week | [~] | Dashboard-only |
| 59 | Days on-time this week | [~] | Dashboard-only |
| 60 | Total late minutes this week | [~] | Dashboard-only |
| 61 | Weekly hours total | [~] | Dashboard-only |
| 62 | Weekly average daily hours | [~] | Dashboard-only |
| 63 | Best day this week (most hours) | [~] | Dashboard-only |
| 64 | Worst day this week (least hours) | [~] | Dashboard-only |
| 65 | Week-over-week change in total hours | [~] | Dashboard-only |
| 66 | Streak: consecutive on-time days | [~] | Dashboard-only |
| 67 | Streak: consecutive present days | [~] | Dashboard-only |

## 4. Attendance — Team/Org Today (Admin)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 68 | Present count today | [x] | `DashboardHome.tsx` (WelcomeHeader) |
| 69 | In-office count | [x] | `DashboardHome.tsx` (WelcomeHeader badge) |
| 70 | Remote count | [x] | `DashboardHome.tsx` (WelcomeHeader badge) |
| 71 | Late count today | [x] | `DashboardHome.tsx` (WelcomeHeader badge) |
| 72 | Overtime count today | [~] | Dashboard-only |
| 73 | Absent count today | [x] | `DashboardHome.tsx` (WelcomeHeader badge) |
| 74 | Live (active session) count | [x] | `DashboardHome.tsx` ("N live") |
| 75 | Location-flagged count today | [~] | Dashboard-only |
| 76 | Avg team working minutes today | [~] | Dashboard-only |
| 77 | Team office vs remote split today | [~] | Dashboard-only |
| 78 | % of team present today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "N% present") |
| 79 | % of team in-office today | [~] | Dashboard-only |
| 80 | % of team late today | [~] | Dashboard-only |
| 81 | First employee to arrive today | [~] | Dashboard-only |
| 82 | Last employee to arrive today | [~] | Dashboard-only |
| 83 | Employee with most hours today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "Most: Name (Xh)") |
| 84 | Employee with fewest hours today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "Least: Name (Xh)") |
| 85 | Team total working hours today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "team Xh Ym total") |
| 86 | Team total office hours today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "Xh office") |
| 87 | Team total remote hours today | [x] | `insights-desk/attendance/page.tsx` (team-date pill "Xh remote") |
| 88 | Employees not yet clocked in | [~] | Dashboard-only |
| 89 | Employees on break / idle | [~] | Dashboard-only |
| 90 | Average late-by minutes (among late) | [x] | `insights-desk/attendance/page.tsx` (team-date pill "avg Xm late") |

## 5. Attendance — Team Monthly Aggregates (Admin)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 91 | Team total present days | [x] | `insights-desk/attendance/page.tsx` |
| 92 | Team total on-time days | [x] | `insights-desk/attendance/page.tsx` |
| 93 | Team total working minutes | [x] | `insights-desk/attendance/page.tsx` |
| 94 | Team avg daily hours | [x] | `insights-desk/attendance/page.tsx` |
| 95 | Team avg on-time % | [x] | `insights-desk/attendance/page.tsx` |
| 96 | Team avg attendance % | [x] | `insights-desk/attendance/page.tsx` |
| 97 | Team total late days | [x] | `insights-desk/attendance/page.tsx` (StatChip "Late Days") |
| 98 | Team total late-to-office days | [x] | `insights-desk/attendance/page.tsx` (StatChip "Late to Office") |
| 99 | Team total absent days | [~] | Needs totalWorkingDays per employee in team-monthly API |
| 100 | Team median attendance % | [x] | `insights-desk/attendance/page.tsx` (Insights "Median Attend.") |
| 101 | Team min attendance % | [x] | `insights-desk/attendance/page.tsx` (Insights "Min Attend.") |
| 102 | Team max attendance % | [x] | `insights-desk/attendance/page.tsx` (Insights "Max Attend.") |
| 103 | Team median on-time % | [x] | `insights-desk/attendance/page.tsx` (Insights "Median On-Time") |
| 104 | Best performing employee (attendance %) | [x] | `insights-desk/attendance/page.tsx` (Insights "Best") |
| 105 | Worst performing employee (attendance %) | [x] | `insights-desk/attendance/page.tsx` (Insights "Needs Attention") |
| 106 | Employees above 90% attendance | [x] | `insights-desk/attendance/page.tsx` (Insights "Above 90%") |
| 107 | Employees below 70% attendance | [x] | `insights-desk/attendance/page.tsx` (Insights "Below 70%") |
| 108 | Employees with 100% on-time | [x] | `insights-desk/attendance/page.tsx` (Insights "100% On-Time") |
| 109 | Team count by department | [x] | `insights-desk/attendance/page.tsx` (ScopeStrip) |
| 109a | Std dev of attendance % | [x] | `insights-desk/attendance/page.tsx` (StatChip "Std Dev Attend.") |
| 109b | Best on-time employee | [x] | `insights-desk/attendance/page.tsx` (StatChip "Best On-Time") |
| 109c | Worst on-time employee | [x] | `insights-desk/attendance/page.tsx` (StatChip "Needs Att. On-Time") |
| 109d | Median daily hours | [x] | `insights-desk/attendance/page.tsx` (StatChip "Median Hours") |
| 109e | Employees with late days | [x] | `insights-desk/attendance/page.tsx` (pill "N late employees") |
| 110 | 5-day presence trend | [~] | API exists but unused |
| 111 | Month-over-month team attendance trend | [~] | Needs historical data |

## 6. Attendance — Team Date (Daily Drill-Down)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 112 | Present count for specific date | [x] | `insights-desk/attendance/page.tsx` |
| 113 | Late count for specific date | [x] | `insights-desk/attendance/page.tsx` |
| 114 | Absent count for specific date | [x] | `insights-desk/attendance/page.tsx` |
| 115 | Per-employee first start for date | [x] | `insights-desk/attendance/page.tsx` |
| 116 | Per-employee last end for date | [x] | `insights-desk/attendance/page.tsx` |
| 117 | Per-employee office/remote split | [x] | `insights-desk/attendance/page.tsx` |
| 118 | Per-employee late-to-office by mins | [x] | `insights-desk/attendance/page.tsx` (card "Office +Xh") |
| 119 | Team avg hours for specific date | [x] | `insights-desk/attendance/page.tsx` (header "avg Xh Ym") |
| 120 | Earliest clock-in for date | [x] | `insights-desk/attendance/page.tsx` (header "first in HH:MM") |
| 121 | Latest clock-out for date | [x] | `insights-desk/attendance/page.tsx` (header "last out HH:MM") |
| 121a | On-time % for date | [x] | `insights-desk/attendance/page.tsx` (team-date pill "N% on-time") |

## 7. Attendance — Individual Session Detail

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 122 | Per-day session list | [x] | `insights-desk/attendance/page.tsx` |
| 123 | Per-session device type | [x] | `insights-desk/attendance/page.tsx` |
| 124 | Per-session in-office or remote | [x] | `insights-desk/attendance/page.tsx` |
| 125 | Per-session office segments | [x] | `insights-desk/attendance/page.tsx` |
| 126 | Per-session IP address | [x] | `insights-desk/attendance/page.tsx` |
| 127 | Per-session device ID | [x] | `insights-desk/attendance/page.tsx` |
| 128 | First/last office entry markers | [x] | `insights-desk/attendance/page.tsx` |
| 129 | Session duration per session | [x] | `insights-desk/attendance/page.tsx` |
| 130 | Unique device count per day | [x] | `insights-desk/attendance/page.tsx` (session header "N devices") |
| 131 | Unique IP count per day | [x] | `insights-desk/attendance/page.tsx` (session header "N IPs") |
| 132 | Multi-device usage flag | [x] | `insights-desk/attendance/page.tsx` (amber highlight when >1 device) |

## 8. Tasks — Counts & Status

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 133 | Total tasks | [x] | `workspace/page.tsx`, `tasks/page.tsx` |
| 134 | Pending tasks | [x] | `workspace/page.tsx`, `tasks/page.tsx`, `DashboardHome.tsx` |
| 135 | In-progress tasks | [x] | `workspace/page.tsx`, `tasks/page.tsx` |
| 136 | Completed tasks | [x] | `workspace/page.tsx`, `tasks/page.tsx` (count + strip pill) |
| 137 | Overdue tasks | [x] | `workspace/page.tsx` (insights strip), `tasks/page.tsx` (strip) |
| 138 | Due soon tasks (within 48h) | [x] | `workspace/page.tsx` (strip), `tasks/page.tsx` (strip) |
| 139 | Due this week | [x] | `workspace/page.tsx` (strip), `tasks/page.tsx` (strip) |
| 140 | No deadline set | [x] | `workspace/page.tsx` (strip), `tasks/page.tsx` (strip) |
| 141 | Completion rate % | [x] | `workspace/page.tsx` (header + strip), `tasks/page.tsx` (header) |
| 142 | Average time to complete a task | [~] | Needs completed-date field |
| 143 | Tasks completed today | [x] | `workspace/page.tsx` (strip pill "N done today") |
| 144 | Tasks completed this week | [x] | `workspace/page.tsx` (strip pill "N done this week") |
| 145 | Tasks completed this month | [x] | `workspace/page.tsx` (strip pill), `tasks/page.tsx` (strip pill "N done this month") |
| 146 | Tasks created today | [x] | `workspace/page.tsx` (strip pill "N created today"), `tasks/page.tsx` (strip pill) |
| 147 | Tasks created this week | [x] | `workspace/page.tsx` (strip pill "N new this week"), `tasks/page.tsx` (strip pill) |
| 148 | Tasks created this month | [x] | `workspace/page.tsx` (strip pill "N created this month"), `tasks/page.tsx` (strip pill) |

## 9. Tasks — Priority

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 149 | Low priority count | [x] | `workspace/page.tsx` (strip pill "L:N"), `tasks/page.tsx` (strip) |
| 150 | Medium priority count | [x] | `workspace/page.tsx` (strip pill "M:N"), `tasks/page.tsx` (strip) |
| 151 | High priority count | [x] | `workspace/page.tsx` (strip pill "H:N"), `tasks/page.tsx` |
| 152 | Urgent priority count | [x] | `workspace/page.tsx` (strip pill "U:N"), `tasks/page.tsx` |
| 153 | High + urgent combined count | [x] | `workspace/page.tsx` (strip "N high/urgent"), `tasks/page.tsx` |
| 154 | % of tasks that are high/urgent | [x] | Derivable from #153 / #133 (both shown) |
| 155 | Overdue high/urgent tasks | [x] | `workspace/page.tsx` (strip pill "N overdue high/urgent") |

## 10. Tasks — Assignment & Ownership

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 156 | Tasks assigned to me | [x] | `workspace/page.tsx` (strip "N mine"), `tasks/page.tsx` (strip) |
| 157 | Tasks created by me | [x] | `workspace/page.tsx` (strip pill "N created by me"), `tasks/page.tsx` (strip pill) |
| 158 | Unassigned tasks | [x] | `workspace/page.tsx` (strip), `tasks/page.tsx` (strip) |
| 158a | Tasks per department (top 3) | [x] | `tasks/page.tsx` (strip pills per department) |
| 159 | Tasks per employee | [x] | `DashboardHome.tsx` → `EmployeeCard.tsx` |
| 160 | Pending tasks per employee | [x] | `EmployeeCard.tsx` |
| 161 | In-progress tasks per employee | [x] | `EmployeeCard.tsx` |
| 162 | Completed tasks per employee | [~] | Dashboard-only (EmployeeCard doesn't show) |
| 163 | Employees with no tasks | [~] | Dashboard-only |
| 164 | Employees with overdue tasks | [~] | Dashboard-only |
| 165 | Most loaded employee (by task count) | [~] | Dashboard-only |
| 166 | Least loaded employee | [~] | Dashboard-only |
| 167 | Employee workload score | [~] | Dashboard-only |

## 11. Tasks — Recurrence & Subtasks

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 168 | Recurring tasks count | [x] | `workspace/page.tsx` (pill + strip) |
| 169 | One-time tasks count | [x] | `workspace/page.tsx` (pill) |
| 170 | Weekly recurring count | [x] | `workspace/page.tsx` (strip "Nw") |
| 171 | Monthly recurring count | [x] | `workspace/page.tsx` (strip "Nm") |
| 172 | Subtask count per task | [~] | Needs subtask API aggregation |
| 173 | Tasks with subtasks | [~] | Needs subtask flag |
| 174 | Tasks without subtasks | [~] | Needs subtask flag |
| 175 | Total subtask count (all tasks) | [~] | Needs subtask aggregation |

## 12. Campaigns — Status

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 176 | Total campaigns | [x] | `workspace/page.tsx`, `campaigns/page.tsx` |
| 177 | Active campaigns | [x] | `campaigns/page.tsx`, `DashboardHome.tsx` |
| 178 | Paused campaigns | [x] | `campaigns/page.tsx` |
| 179 | Completed campaigns | [x] | `campaigns/page.tsx` |
| 180 | Cancelled campaigns | [x] | `campaigns/page.tsx` |
| 181 | Campaign completion rate % | [x] | `campaigns/page.tsx` (header subtitle), `workspace/page.tsx` (strip pill "N% campaigns done") |
| 182 | Campaigns with no tasks | [x] | `workspace/page.tsx` (strip "N empty campaigns") |
| 183 | Campaigns nearing end date (7 days) | [x] | `workspace/page.tsx` (strip), `campaigns/page.tsx` (strip) |
| 184 | Campaigns past end date (still active) | [x] | `workspace/page.tsx` (strip), `campaigns/page.tsx` (strip) |
| 185 | Average campaign duration | [~] | Needs date range calc |
| 185a | Average tags per campaign | [x] | `campaigns/page.tsx` (strip pill "N avg tags/campaign") |
| 185b | Average timeline elapsed % | [x] | `campaigns/page.tsx` (strip pill "N% avg timeline elapsed") |
| 185c | Soonest ending campaign | [x] | `campaigns/page.tsx` (strip pill "Name · Nd left") |
| 186 | Average tasks per campaign | [x] | `workspace/page.tsx` (strip pill "avg N tasks/campaign") |

## 13. Campaigns — Task Stats

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 187 | Per-campaign task total | [x] | `workspace/page.tsx` |
| 188 | Per-campaign completed tasks | [x] | `workspace/page.tsx` (footer "N done") |
| 189 | Per-campaign task completion % | [~] | Dashboard-only |
| 190 | Per-campaign recurring count | [x] | `workspace/page.tsx` |
| 191 | Today's due (recurring) | [x] | `workspace/page.tsx` |
| 192 | Today's done (recurring) | [x] | `workspace/page.tsx` |
| 193 | Today's checklist completion % | [x] | `workspace/page.tsx` (campaignInsights.todayChecklistPct strip) |
| 194 | Org-wide today checklist total due | [x] | `workspace/page.tsx` (strip "checklist N/M") |
| 195 | Org-wide today checklist total done | [x] | `workspace/page.tsx` (strip) |
| 196 | Org-wide today checklist % | [x] | `workspace/page.tsx` (strip "(N%)") |
| 197 | Campaign overview (7-day grid) | [x] | `workspace/page.tsx` (expanded view) |

## 14. Campaigns — People & Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 198 | Campaigns per department | [~] | Dashboard-only |
| 199 | Employees across all active campaigns | [x] | `campaigns/page.tsx` (subtitle), `workspace/page.tsx` (pill "N people in campaigns") |
| 200 | Active campaigns per employee | [x] | `EmployeeCard.tsx` |
| 201 | Departments involved in campaigns | [x] | `campaigns/page.tsx` (subtitle "N depts") |
| 202 | Campaign with most employees | [~] | Dashboard-only |
| 203 | Campaign with most tasks | [~] | Dashboard-only |
| 204 | Employees in 3+ active campaigns | [~] | Dashboard-only |
| 205 | Employees in zero campaigns | [~] | Dashboard-only |

## 15. Leaves — Personal

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 206 | Leave balance total | [x] | `insights-desk/attendance/page.tsx`, `LeavesModal.tsx` |
| 207 | Leave used | [x] | `insights-desk/attendance/page.tsx`, `LeavesModal.tsx` |
| 208 | Leave remaining | [x] | `insights-desk/attendance/page.tsx`, `LeavesModal.tsx` |
| 209 | Leave usage % | [x] | `insights-desk/attendance/page.tsx`, `LeavesModal.tsx` |
| 210 | Pending leave requests (self) | [x] | `LeavesModal.tsx` |
| 211 | Approved leaves this month | [x] | `LeavesModal.tsx` |
| 212 | On leave today | [x] | `LeavesModal.tsx` (personal extras "On Leave Today Yes/No") |
| 213 | Leave by type breakdown (count) | [x] | `LeavesModal.tsx` (leaveTypeCounts pills in history section) |
| 213a | Leave by type breakdown (days) | [x] | `LeavesModal.tsx` (pills "Nd Type" in insights strip) |
| 213b | Approval rate % | [x] | `LeavesModal.tsx` (pill "N% approval") |
| 213c | Average leave duration | [x] | `LeavesModal.tsx` (pill "avg Nd per leave") |
| 213d | Days since last leave | [x] | `LeavesModal.tsx` (pill "Nd since last leave") |
| 213e | Rejected leaves count | [x] | `LeavesModal.tsx` (summary tile "Rejected N") |
| 214 | Half-day leaves count | [x] | `LeavesModal.tsx` (personal extras "Half-Day Leaves") |
| 215 | Past correction leaves count | [~] | Needs leave-type filtering |
| 216 | Next scheduled leave | [x] | `LeavesModal.tsx` (personal extras "Next Scheduled Leave") |
| 217 | Days until leave balance runs out | [x] | `LeavesModal.tsx` (balance card "Days Until Balance Runs Out ~Nd") |
| 218 | Leaves taken per month (trend) | [~] | Dashboard-only |

## 16. Leaves — Team (Admin)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 219 | Team pending leave requests | [~] | Needs team leave API |
| 220 | Team approved leave requests this month | [~] | Needs team leave API |
| 221 | Team leave days this month | [~] | Needs team leave API |
| 222 | Team members on leave today | [~] | Dashboard-only |
| 223 | Team avg leave usage % | [~] | Needs team balance API |
| 224 | Team members with low leave balance | [~] | Needs team balance API |
| 225 | Team members who haven't taken leave | [~] | Needs team leave API |
| 226 | Leave requests awaiting my approval | [~] | Needs approval queue API |
| 227 | Leave type distribution (team-wide) | [~] | Needs team leave API |
| 228 | Busiest leave month (historical) | [~] | Needs historical data |

## 17. Payroll — Personal

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 229 | Base salary | [x] | `PayrollModal.tsx` |
| 230 | Gross pay (month) | [x] | `PayrollModal.tsx` |
| 231 | Total deductions (month) | [x] | `PayrollModal.tsx` |
| 232 | Net pay (month) | [x] | `PayrollModal.tsx` (hero) |
| 233 | Overtime hours | [x] | `PayrollModal.tsx` |
| 234 | Deduction % | [x] | `PayrollModal.tsx` |
| 235 | Take-home % | [x] | `PayrollModal.tsx` |
| 236 | Attendance rate % | [x] | `PayrollModal.tsx` |
| 237 | Pay breakdown bar | [x] | `PayrollModal.tsx` |
| 238 | Per-deduction breakdown | [x] | `PayrollModal.tsx` |
| 239 | Late penalty amount | [x] | `PayrollModal.tsx` |
| 240 | Absence penalty amount | [x] | `PayrollModal.tsx` |
| 241 | Overtime pay amount | [x] | `PayrollModal.tsx` (Rate Insights tile) |
| 242 | Effective hourly rate | [x] | `PayrollModal.tsx` (Rate Insights tile) |
| 243 | Daily rate | [x] | `PayrollModal.tsx` (Rate Insights tile) |
| 244 | Deduction per late day | [~] | Needs late-day count + deduction split |
| 245 | Pay per present day | [x] | `PayrollModal.tsx` (Rate Insights tile) |
| 245a | Overtime hourly rate | [x] | `PayrollModal.tsx` (Rate Insights tile "OT Hourly Rate") |
| 245b | Net daily rate | [x] | `PayrollModal.tsx` (Rate Insights tile "Net Daily Rate") |

## 18. Payroll — Personal Year/YTD

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 246 | YTD earned | [x] | `PayrollModal.tsx` |
| 247 | YTD deductions | [x] | `PayrollModal.tsx` |
| 248 | YTD net pay | [x] | `PayrollModal.tsx` (year hero) |
| 249 | YTD months processed | [x] | `PayrollModal.tsx` |
| 250 | YTD work days | [x] | `PayrollModal.tsx` |
| 251 | YTD present days | [x] | `PayrollModal.tsx` |
| 252 | YTD absent days | [x] | `PayrollModal.tsx` |
| 253 | YTD late days | [x] | `PayrollModal.tsx` |
| 254 | YTD leave days | [x] | `PayrollModal.tsx` |
| 255 | YTD gross pay | [x] | `PayrollModal.tsx` |
| 256 | Month-over-month pay trend | [x] | `PayrollModal.tsx` (year tab rows) |
| 257 | YTD avg monthly net pay | [x] | `PayrollModal.tsx` (YTD Insights tile) |
| 258 | YTD attendance % | [x] | `PayrollModal.tsx` (YTD Insights tile) |
| 259 | YTD deduction % | [x] | `PayrollModal.tsx` (YTD Insights tile) |
| 260 | Best month (highest net pay) | [x] | `PayrollModal.tsx` (YTD Insights tile) |
| 261 | Worst month (highest deductions) | [x] | `PayrollModal.tsx` (YTD Insights tile) |
| 261a | Best gross month | [x] | `PayrollModal.tsx` (YTD Insights tile "Best Gross") |
| 261b | Lowest net pay month | [x] | `PayrollModal.tsx` (YTD Insights tile "Lowest Net") |
| 261c | Lowest deductions month | [x] | `PayrollModal.tsx` (YTD Insights tile "Lowest Ded.") |
| 261d | Total overtime hours (year) | [x] | `PayrollModal.tsx` (YTD Insights tile "Total OT") |
| 262 | Salary growth (from salaryHistory) | [~] | Needs salary history on API |
| 263 | Last salary increment date | [~] | Needs salary history |
| 264 | Last salary increment % | [~] | Needs salary history |

## 19. Payroll — Personal Daily Breakdown

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 265 | Daily status | [x] | `PayrollModal.tsx` (daily tab) |
| 266 | Daily working minutes | [x] | `PayrollModal.tsx` |
| 267 | Daily office minutes | [x] | `PayrollModal.tsx` |
| 268 | Daily remote minutes | [x] | `PayrollModal.tsx` |
| 269 | Daily late minutes | [x] | `PayrollModal.tsx` |
| 270 | Daily deduction | [x] | `PayrollModal.tsx` |
| 271 | Daily first start | [x] | `PayrollModal.tsx` |
| 272 | Daily last end | [x] | `PayrollModal.tsx` |
| 273 | Daily total deduction (footer) | [x] | `PayrollModal.tsx` |
| 274 | Daily total working hours (footer) | [x] | `PayrollModal.tsx` |
| 275 | Days with deductions | [x] | `PayrollModal.tsx` (Deduction Summary tile) |
| 276 | Days with zero deductions | [x] | `PayrollModal.tsx` (Deduction Summary tile) |
| 277 | Highest single-day deduction | [x] | `PayrollModal.tsx` (Deduction Summary tile) |
| 277a | Median daily deduction | [x] | `PayrollModal.tsx` (Deduction Summary tile "Median Deduction") |
| 277b | Total late minutes (daily) | [x] | `PayrollModal.tsx` (Deduction Summary tile "Total Late") |
| 277c | Office vs remote hours (daily) | [x] | `PayrollModal.tsx` (Deduction Summary tile "Office / Remote") |

## 20. Payroll — Team/Org (Admin)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 278 | Total net pay (team) | [x] | `PayrollModal.tsx` (report tab hero) |
| 279 | Total gross pay (team) | [x] | `PayrollModal.tsx` |
| 280 | Total deductions (team) | [x] | `PayrollModal.tsx` |
| 281 | Total employees on payroll | [x] | `PayrollModal.tsx` |
| 282 | Team working days | [x] | `PayrollModal.tsx` |
| 283 | Team holidays count | [x] | `PayrollModal.tsx` |
| 284 | Payroll generation date | [x] | `PayrollModal.tsx` |
| 285 | Per-employee attendance % | [x] | `PayrollModal.tsx` (report table) |
| 286 | Per-employee absence deduction | [x] | `PayrollModal.tsx` |
| 287 | Per-employee late deduction | [x] | `PayrollModal.tsx` |
| 288 | Per-employee overtime hours | [x] | `PayrollModal.tsx` |
| 289 | Year totals: gross/deductions/net | [x] | `PayrollModal.tsx` (year tab) |
| 290 | Team avg attendance % | [x] | `PayrollModal.tsx` (Team Insights tile) |
| 291 | Team total overtime hours | [x] | `PayrollModal.tsx` (Team Insights tile) |
| 292 | Team avg late days | [x] | `PayrollModal.tsx` (Team Insights tile "Avg Late Days") |
| 293 | Team avg absence days | [x] | `PayrollModal.tsx` (Team Insights tile "Avg Absence Days") |
| 294 | Team avg net pay | [x] | `PayrollModal.tsx` (Team Insights tile) |
| 295 | Team avg salary | [x] | `PayrollModal.tsx` (Team Insights tile "Avg Salary") |
| 296 | Team median salary | [x] | `PayrollModal.tsx` (Team Insights tile "Median Salary") |
| 297 | Highest paid employee | [x] | `PayrollModal.tsx` (Team Insights tile "Highest Paid") |
| 298 | Lowest paid employee | [x] | `PayrollModal.tsx` (Team Insights tile "Lowest Paid") |
| 299 | Highest deductions employee | [x] | `PayrollModal.tsx` (Team Insights tile "Highest Deductions") |
| 300 | Employees with zero deductions | [x] | `PayrollModal.tsx` (Team Insights tile) |
| 301 | Employees with overtime | [x] | `PayrollModal.tsx` (Team Insights tile) |
| 301a | Best attendance employee | [x] | `PayrollModal.tsx` (Team Insights tile "Best Attendance") |
| 301b | Worst attendance employee | [x] | `PayrollModal.tsx` (Team Insights tile "Worst Attendance") |
| 301c | Most late days employee | [x] | `PayrollModal.tsx` (Team Insights tile "Most Late Days") |
| 301d | Lowest net pay employee | [x] | `PayrollModal.tsx` (Team Insights tile "Lowest Net Pay") |
| 301e | Salary range (max - min) | [x] | `PayrollModal.tsx` (Team Insights tile "Salary Range") |
| 302 | Total overtime pay (team) | [~] | Needs overtime pay per employee |
| 303 | Payslip status breakdown | [~] | Needs payslip status API |
| 304 | Year attendance % | [~] | Dashboard-only |
| 305 | Payroll cost trend | [~] | Dashboard-only |

## 21. Organization / Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 306 | Total employees | [x] | `departments/page.tsx`, `organization/page.tsx`, `employees/page.tsx` |
| 307 | Active employees | [x] | `organization/page.tsx`, `employees/page.tsx` (subtitle) |
| 308 | Inactive employees | [x] | `employees/page.tsx` (subtitle + insights strip) |
| 309 | Total departments | [x] | `organization/page.tsx`, `departments/page.tsx` |
| 310 | Employees per department | [x] | `departments/page.tsx`, `DepartmentsPanel.tsx`, `OrgFlowTree.tsx` |
| 311 | Departments with no manager | [x] | `departments/page.tsx` (insights strip) |
| 312 | Largest department (with count) | [x] | `departments/page.tsx` (insights strip "Largest: Name (N)") |
| 313 | Smallest department (with count) | [x] | `departments/page.tsx` (insights strip "Smallest: Name (N)") |
| 313a | Inactive departments | [x] | `departments/page.tsx` (insights strip pill "N inactive") |
| 314 | Average department size | [x] | `departments/page.tsx` (subtitle + insights strip) |
| 315 | Empty departments (0 employees) | [x] | `departments/page.tsx` (insights strip) |
| 316 | Departments with sub-departments | [x] | `departments/page.tsx` (insights strip pill "N with sub-depts") |
| 317 | Max department nesting depth | [x] | `departments/page.tsx` (insights strip pill "N levels deep") |
| 318 | Employees with salary history | [~] | Needs salary history API |
| 319 | Recent salary changes (last 30 days) | [~] | Needs salary audit log |
| 320 | Shift type breakdown | [x] | `employees/page.tsx` (insights strip pills per shift type) |
| 321 | New employees this month | [x] | `employees/page.tsx` (insights strip + subtitle) |
| 322 | Verified vs unverified employees | [x] | `employees/page.tsx` (insights strip) |
| 323 | Employees with custom permissions | [~] | Needs permissions data |
| 324 | Employees per designation | [x] | `employees/page.tsx` (insights strip pills top-5 designations) |
| 325 | Reporting chain depth | [~] | Needs hierarchy traversal |
| 326 | Employees with no department | [x] | `employees/page.tsx` (insights strip) |
| 326a | Employees with no designation | [x] | `employees/page.tsx` (insights strip pill "N no designation") |
| 326b | Verification rate % | [x] | `employees/page.tsx` (insights strip pill "N% verified") |
| 326c | Active rate % | [x] | `employees/page.tsx` (insights strip pill "N% active") |
| 326d | Super admin count | [x] | `employees/page.tsx` (insights strip pill "N super admin") |
| 327 | Employee turnover (deactivated this month) | [~] | Needs audit log |

## 22. Activity Logs / Audit

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 328 | Total activity log count | [~] | Needs dedicated audit page |
| 329 | Activity by entity type (grouped) | [x] | `DashboardHome.tsx` (sidebar), `workspace/page.tsx` (sidebar) |
| 330 | Activity count today | [~] | Needs audit page |
| 331 | Activity count this week | [~] | Needs audit page |
| 332 | Activity count this month | [~] | Needs audit page |
| 333 | Most active entity type | [~] | Needs audit page |
| 334 | Security events count | [~] | Needs audit page |
| 335 | Auth events count | [~] | Needs audit page |
| 336 | Unique active users today (by log) | [~] | Needs audit page |
| 337 | Most active user (by log count) | [~] | Needs audit page |
| 338 | Actions per hour (histogram) | [~] | Needs audit page |
| 339 | Activity trend (daily over 7 days) | [~] | Needs audit page |
| 340 | Failed login attempts | [~] | Needs audit page |
| 341 | Password changes today | [~] | Needs audit page |
| 342 | Settings changes today | [~] | Needs audit page |
| 343 | Employee CRUD actions today | [~] | Needs audit page |
| 344 | Task/campaign CRUD actions today | [~] | Needs audit page |
| 345 | Unread activity count | [x] | `DashboardHome.tsx` (badge), `workspace/page.tsx` (badge) |
| 346 | Unread per entity type | [x] | `DashboardHome.tsx` (accordion badges) |

## 23. Location Flags / Compliance

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 347 | Total location flags | [~] | Needs location flags page |
| 348 | Warning count | [~] | Needs location flags page |
| 349 | Violation count | [~] | Needs location flags page |
| 350 | Acknowledged vs unacknowledged | [~] | Needs location flags page |
| 351 | Flags per employee | [~] | Needs location flags page |
| 352 | Flag reasons breakdown | [~] | Needs location flags page |
| 353 | Flagged employees today | [~] | Dashboard-only |
| 354 | Repeat offenders (3+ flags) | [~] | Needs location flags page |
| 355 | Flags this week | [~] | Needs location flags page |
| 356 | Flags this month | [~] | Needs location flags page |
| 357 | Flags trend (daily over 7 days) | [~] | Needs location flags page |
| 358 | Most flagged employee | [~] | Needs location flags page |
| 359 | Employees never flagged | [~] | Needs location flags page |
| 360 | Avg flags per employee | [~] | Needs location flags page |
| 361 | Flag acknowledgment rate % | [~] | Needs location flags page |

## 24. Pings / Communication

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 362 | Unread pings | [x] | `DashboardShell.tsx` (badge) |
| 363 | Total pings received | [~] | Dashboard-only |
| 364 | Pings sent today | [~] | Dashboard-only |
| 365 | Pings received today | [~] | Dashboard-only |
| 366 | Most pinged employee | [~] | Dashboard-only |
| 367 | Most pinging employee | [~] | Dashboard-only |

## 25. Holidays / Calendar

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 368 | Holidays this year | [x] | `insights-desk/attendance/page.tsx` (calendar) |
| 369 | Holidays this month | [x] | `insights-desk/attendance/page.tsx` (calendar legend pill "N this month") |
| 370 | Upcoming holidays | [x] | `insights-desk/attendance/page.tsx` (calendar legend pill "N upcoming" + "N left this year") |
| 371 | Next holiday (name + date) | [x] | `insights-desk/attendance/page.tsx` (calendar legend "Next: Mon DD") |
| 372 | Days until next holiday | [x] | `insights-desk/attendance/page.tsx` (calendar legend "(Nd)") |
| 373 | Recurring holidays count | [~] | Needs holiday type field |
| 374 | Holidays remaining this year | [x] | `insights-desk/attendance/page.tsx` (calendar legend) |
| 375 | Working days remaining this month | [~] | Dashboard-only |
| 376 | Working days remaining this year | [~] | Dashboard-only |

## 26. Schedule / Shift

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 377 | Today's shift start/end | [x] | `EmployeeCard.tsx` |
| 378 | Total shift hours today | [x] | `DashboardHome.tsx` |
| 379 | Net working hours (minus break) | [~] | Dashboard-only |
| 380 | Grace minutes | [~] | Dashboard-only |
| 381 | Is today a day off? | [~] | Dashboard-only |
| 382 | Shift type label | [x] | `employees/page.tsx` (shiftSummaryLine) |
| 383 | Days until next day off | [~] | Dashboard-only |
| 384 | Working days this week | [x] | `employees/page.tsx` (shiftSummaryLine) |
| 385 | Break duration configured | [~] | Dashboard-only |

## 27. Payroll Config / Policy

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 386 | Late penalty tiers | [~] | Settings page (exists but not as stat) |
| 387 | Absence penalty per day | [~] | Settings page |
| 388 | Overtime rate multiplier | [~] | Settings page |
| 389 | Pay day | [~] | Dashboard-only |
| 390 | Days until payday | [~] | Dashboard-only |

---

## CROSS-REFERENCE COMBINATIONS

> These stats require joining data from multiple API domains and are best suited for a dedicated analytics/dashboard view.

## 28. Attendance × Tasks

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 391 | Attendance % vs task completion % per employee | [~] | Dashboard-only |
| 392 | Hours worked vs tasks completed correlation | [~] | Dashboard-only |
| 393 | Late employees with overdue tasks | [~] | Dashboard-only |
| 394 | Absent employees with pending tasks | [~] | Dashboard-only |
| 395 | Present employees with no tasks | [~] | Dashboard-only |
| 396 | On-time employees vs their task performance | [~] | Dashboard-only |
| 397 | Average hours per completed task | [~] | Dashboard-only |
| 398 | Tasks completed per hour worked | [~] | Dashboard-only |

## 29. Attendance × Campaigns

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 399 | Campaign progress vs team attendance | [~] | Dashboard-only |
| 400 | Campaigns with absent key employees today | [~] | Dashboard-only |
| 401 | Active campaigns affected by employee absence | [~] | Dashboard-only |
| 402 | Checklist completion rate vs presence rate | [~] | Dashboard-only |

## 30. Attendance × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 403 | Avg attendance % by department | [~] | Dashboard-only |
| 404 | Avg on-time % by department | [~] | Dashboard-only |
| 405 | Department with best attendance | [~] | Dashboard-only |
| 406 | Department with worst attendance | [~] | Dashboard-only |
| 407 | Department present count today | [~] | Dashboard-only |
| 408 | Department absent count today | [~] | Dashboard-only |
| 409 | Department avg daily hours | [~] | Dashboard-only |
| 410 | Department late count | [~] | Dashboard-only |
| 411 | Department with most late arrivals | [~] | Dashboard-only |
| 412 | Department with most overtime | [~] | Dashboard-only |

## 31. Attendance × Payroll

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 413 | Cost per present day (org-wide) | [~] | Dashboard-only |
| 414 | Cost per working hour (org-wide) | [~] | Dashboard-only |
| 415 | Late days vs late deduction correlation | [~] | Dashboard-only |
| 416 | Absence days vs absence deduction correlation | [~] | Dashboard-only |
| 417 | Attendance % vs net pay ranking | [~] | Dashboard-only |
| 418 | Overtime hours vs overtime pay | [~] | Dashboard-only |
| 419 | Payroll saved from deductions (total) | [~] | Dashboard-only |
| 420 | Effective cost per employee per day | [~] | Dashboard-only |

## 32. Attendance × Leaves

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 421 | Leave usage vs attendance % | [~] | Dashboard-only |
| 422 | Employees on leave today vs absent (no leave) | [~] | Dashboard-only |
| 423 | Unexplained absences (absent without leave) | [~] | Dashboard-only |
| 424 | Sick leave frequency vs late arrivals | [~] | Dashboard-only |
| 425 | Leave balance remaining vs attendance % | [~] | Dashboard-only |

## 33. Tasks × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 426 | Tasks per department (via assignee) | [~] | Dashboard-only |
| 427 | Pending tasks by department | [~] | Dashboard-only |
| 428 | Overdue tasks by department | [~] | Dashboard-only |
| 429 | Task completion rate by department | [~] | Dashboard-only |
| 430 | Department workload ranking | [~] | Dashboard-only |
| 431 | Department with most overdue tasks | [~] | Dashboard-only |

## 34. Tasks × Campaigns × Employees (3-way)

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 432 | Tasks per campaign | [x] | `workspace/page.tsx` |
| 433 | Employee workload across campaigns | [~] | Dashboard-only |
| 434 | Campaign health score | [~] | Dashboard-only |
| 435 | Bottleneck employees | [~] | Dashboard-only |
| 436 | Campaign delay risk | [~] | Dashboard-only |

## 35. Payroll × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 437 | Total payroll cost by department | [~] | Dashboard-only |
| 438 | Avg salary by department | [~] | Dashboard-only |
| 439 | Department with highest payroll | [~] | Dashboard-only |
| 440 | Department with lowest payroll | [~] | Dashboard-only |
| 441 | Deductions by department | [~] | Dashboard-only |
| 442 | Overtime hours by department | [~] | Dashboard-only |

## 36. Payroll × Tasks

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 443 | Cost per task completed | [~] | Dashboard-only |
| 444 | Pay vs productivity correlation | [~] | Dashboard-only |
| 445 | Highest paid employee vs task output | [~] | Dashboard-only |

## 37. Leaves × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 446 | Leave days by department | [~] | Dashboard-only |
| 447 | Pending leave requests by department | [~] | Dashboard-only |
| 448 | Department with most leaves this month | [~] | Dashboard-only |
| 449 | Department avg leave balance remaining | [~] | Dashboard-only |
| 450 | Department with most sick leaves | [~] | Dashboard-only |

## 38. Leaves × Tasks

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 451 | Employees on leave with pending tasks | [~] | Dashboard-only |
| 452 | Tasks blocked by employee on leave | [~] | Dashboard-only |
| 453 | Campaign impact of leaves | [~] | Dashboard-only |

## 39. Location Flags × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 454 | Flags by department | [~] | Needs location flags page |
| 455 | Department with most flags | [~] | Needs location flags page |
| 456 | Department flag rate | [~] | Needs location flags page |

## 40. Location Flags × Attendance

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 457 | Flagged sessions vs total sessions % | [~] | Needs location flags page |
| 458 | Flagged employees attendance % | [~] | Dashboard-only |
| 459 | Flag frequency vs late arrivals | [~] | Dashboard-only |

## 41. Activity × Departments

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 460 | Activity count by department | [~] | Needs audit page |
| 461 | Most active department | [~] | Needs audit page |
| 462 | Least active department | [~] | Needs audit page |

## 42. Multi-Domain Scores & Rankings

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 463 | Employee efficiency score | [~] | Dashboard-only |
| 464 | Employee reliability score | [~] | Dashboard-only |
| 465 | Department health score | [~] | Dashboard-only |
| 466 | Organization health score | [~] | Dashboard-only |
| 467 | Campaign risk score | [~] | Dashboard-only |
| 468 | Team productivity index | [~] | Dashboard-only |
| 469 | Payroll efficiency ratio | [~] | Dashboard-only |
| 470 | Best all-round employee | [~] | Dashboard-only |

## 43. Trend / Time-Series Derivatives

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 471 | Daily attendance trend (7 days) | [~] | Dashboard-only |
| 472 | Weekly attendance trend (4 weeks) | [~] | Dashboard-only |
| 473 | Monthly attendance trend (12 months) | [~] | Dashboard-only |
| 474 | Daily task completion trend (7 days) | [~] | Dashboard-only |
| 475 | Weekly task creation trend | [~] | Dashboard-only |
| 476 | Payroll cost trend (12 months) | [~] | Dashboard-only |
| 477 | Leave usage trend (monthly) | [~] | Dashboard-only |
| 478 | Flag count trend (weekly) | [~] | Dashboard-only |
| 479 | Team size trend (monthly) | [~] | Dashboard-only |
| 480 | On-time % trend (monthly) | [~] | Dashboard-only |

## 44. Threshold / Alert Stats

| # | Stat | Status | Location(s) |
|---|------|--------|-------------|
| 481 | Employees below 70% attendance | [x] | `insights-desk/attendance/page.tsx` (Insights "Below 70%") |
| 482 | Employees with 3+ late days this week | [~] | Dashboard-only |
| 483 | Employees with 3+ flags this month | [~] | Needs location flags page |
| 484 | Tasks overdue by 7+ days | [~] | Dashboard-only |
| 485 | Campaigns with <50% completion nearing deadline | [~] | Dashboard-only |
| 486 | Employees with leave balance <2 days | [~] | Dashboard-only |
| 487 | Employees with salary unchanged 12+ months | [~] | Needs salary history |
| 488 | Departments with >20% absence rate | [~] | Dashboard-only |
| 489 | Employees working <6h avg daily | [~] | Dashboard-only |
| 490 | Employees with stale sessions right now | [~] | Dashboard-only |

---

## Summary

| Category | Total | `[x]` Rendered | `[~]` Not Rendered | `[ ]` Not Impl. |
|----------|-------|----------------|---------------------|-----------------|
| 1. Attendance — Personal Today | 25 | 20 | 5 | 0 |
| 2. Attendance — Monthly Personal | 35 | 30 | 5 | 0 |
| 3. Weekly Personal | 13 | 2 | 11 | 0 |
| 4. Attendance — Team Today | 23 | 14 | 9 | 0 |
| 5. Attendance — Team Monthly | 26 | 22 | 4 | 0 |
| 6. Attendance — Team Date | 11 | 11 | 0 | 0 |
| 7. Attendance — Session Detail | 11 | 11 | 0 | 0 |
| 8. Tasks — Counts & Status | 16 | 15 | 1 | 0 |
| 9. Tasks — Priority | 7 | 7 | 0 | 0 |
| 10. Tasks — Assignment | 13 | 7 | 6 | 0 |
| 11. Tasks — Recurrence | 8 | 4 | 4 | 0 |
| 12. Campaigns — Status | 14 | 12 | 2 | 0 |
| 13. Campaigns — Task Stats | 11 | 11 | 0 | 0 |
| 14. Campaigns — People & Depts | 8 | 3 | 5 | 0 |
| 15. Leaves — Personal | 18 | 16 | 2 | 0 |
| 16. Leaves — Team | 10 | 0 | 10 | 0 |
| 17. Payroll — Personal | 19 | 18 | 1 | 0 |
| 18. Payroll — Personal YTD | 23 | 20 | 3 | 0 |
| 19. Payroll — Daily | 16 | 16 | 0 | 0 |
| 20. Payroll — Team | 33 | 32 | 1 | 0 |
| 21. Organization / Departments | 27 | 22 | 5 | 0 |
| 22. Activity Logs | 19 | 3 | 16 | 0 |
| 23. Location Flags | 15 | 0 | 15 | 0 |
| 24. Pings | 6 | 1 | 5 | 0 |
| 25. Holidays / Calendar | 9 | 7 | 2 | 0 |
| 26. Schedule / Shift | 9 | 4 | 5 | 0 |
| 27. Payroll Config | 5 | 0 | 5 | 0 |
| 28–44. Cross-Refs & Advanced | 100 | 2 | 98 | 0 |
| **TOTAL** | **530** | **298** | **232** | **0** |

### Progress: 147 → 234 → 255 → 298 rendered in UI

**This round added 43 new stats** — 3 upgraded from `[~]` to `[x]` (#145, #146, #148 now rendered as pills) + 40 entirely new derivations implemented as pills/tiles:

- **Attendance personal:** 6 new (present streak, max/min hours day, remote-only days, office-only days, on-time streak)
- **Attendance team aggregate:** 5 new (std dev, best/worst on-time, median hours, late employee count)
- **Attendance team date:** 1 new (on-time %)
- **Payroll personal:** 2 new (OT hourly rate, net daily rate)
- **Payroll YTD:** 4 new (best gross, lowest net, lowest deductions, total OT hours)
- **Payroll daily:** 3 new (median deduction, total late, office/remote hours)
- **Payroll team:** 5 new (best/worst attendance, most late, lowest net, salary range)
- **Leaves personal:** 5 new (approval rate, avg duration, days since last, days-by-type, rejected count)
- **Campaigns:** 3 new (avg tags, timeline elapsed %, soonest ending)
- **Tasks:** 1 new (tasks per department top 3)
- **Departments:** 1 new (inactive departments count, largest/smallest with counts)
- **Employees:** 4 new (no designation, verification rate %, active rate %, super admin count)

**Also improved UX:**
- PayrollModal: increased to `max-w-7xl`/`max-w-4xl`, shows static shell (tabs + employee header) immediately while data loads, per-tab shimmer skeletons
- LeavesModal: increased to `max-w-6xl`/`max-w-3xl`, added loading shimmer for summary tiles

**Remaining `[~]` stats** (232) fall into four groups:
1. **Dashboard-only / cross-domain** (~100) — cross-reference stats needing data from multiple domains (categories 28–44)
2. **Needs new page** — activity logs audit page, location flags compliance page, team leaves dashboard
3. **Needs new API** — team leave aggregation, salary history, shift config per user, attendance trend integration
4. **Dashboard-exclusive** — weekly personal stats, shift/schedule details, ping analytics
