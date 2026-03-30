# Employee Invite System + Full Name Migration — Implementation Plan

## Overview

Three changes:
1. **Invite flow** (like inventory app): No password on create. Send invite email → user sets password via `/setup-password?token=...`
2. **Username auto-from-email**: Part before `@` becomes username (auto-generated, not a form field)
3. **Full name instead of first + last**: Single `about.fullName` field replaces `about.firstName` + `about.lastName`

---

## Phase 1: Model Changes

**File:** `lib/models/User.ts`

- Replace `about.firstName` + `about.lastName` with `about.fullName: string`
- Add `passwordSet: { type: Boolean, default: true }` (false for invited users)
- Add `inviteToken?: string` and `inviteTokenExpiry?: Date`
- Update `fullName` virtual to just return `this.about?.fullName ?? this.username`

```
about: {
  fullName: { type: String, required: true, trim: true },  // was firstName + lastName
  phone: string,
  profileImage: string,
}
+ passwordSet: Boolean (default true)
+ inviteToken: String
+ inviteTokenExpiry: Date
```

---

## Phase 2: Employee Create API (Invite Flow)

**File:** `app/api/employees/route.ts`

Current: takes `email, username, password, firstName, lastName, userRole` → hashes password → creates user → sends welcome email with temp password

New:
1. Input: `{ email, fullName, userRole, department, workShift }`
2. Auto-derive `username` from email: `email.split("@")[0].toLowerCase()`
3. Check uniqueness of both email and username
4. Generate invite token: `crypto.randomBytes(32).toString("hex")` → SHA-256 hash stored in DB
5. Create user with:
   - `password`: placeholder random hash (user never uses it)
   - `about.fullName`: from input
   - `username`: auto-derived
   - `passwordSet: false`
   - `isVerified: false`
   - `inviteToken`: hashed token
   - `inviteTokenExpiry`: 7 days from now
6. Send invite email with setup URL: `${baseUrl}/setup-password?token=${rawToken}`
7. Return `{ user, setupUrl (if email fails), emailSent }`

---

## Phase 3: Setup Password API + Page

### API: `app/api/auth/setup-password/route.ts` (NEW)

Port from inventory app:

**GET** `?token=xxx`:
- Hash token with SHA-256
- Find user with matching `inviteToken`, not expired, `passwordSet: false`
- Return `{ valid: true, email }` or `{ valid: false }`

**POST** `{ token, password }`:
- Validate token same as GET
- Hash password with bcrypt
- Set `passwordSet: true`, `isVerified: true`
- Clear `inviteToken` and `inviteTokenExpiry`
- Return `{ success: true, email }`

### Page: `app/setup-password/page.tsx` (NEW)

Port from inventory app with our design system:
- Validates token on mount via GET
- Shows "Invalid or Expired Link" if invalid
- Shows password form (PasswordInput + PasswordStrength + confirm) if valid
- Shows "Password Created" success state with "Sign In" button
- Uses our glass card, aurora background, animations

---

## Phase 4: Resend Invite API

**File:** `app/api/employees/[id]/resend/route.ts` (NEW)

- Only SuperAdmin can call
- Find user, check `passwordSet === false`
- Generate new invite token, update expiry
- Send invite email
- Return `{ emailSent, setupUrl }`

---

## Phase 5: Mail Changes

**File:** `lib/mail.ts`

- Replace `sendWelcomeEmail(to, name, role, tempPassword)` with `sendInviteEmail(to, setupUrl, invitedBy)`
- Invite email template: "You've been invited! Set up your password to start tracking your presence."
- Update `buildInviteHtml` to match

---

## Phase 6: Employee Edit API

**File:** `app/api/employees/[id]/route.ts`

- Change `body.firstName` / `body.lastName` updates to `body.fullName` → `update["about.fullName"]`

---

## Phase 7: Profile API

**File:** `app/api/profile/route.ts`

- Change `body.firstName` / `body.lastName` to `body.fullName` → `update["about.fullName"]`

---

## Phase 8: Auth (NextAuth)

**File:** `lib/auth.ts`

- Change session/JWT from `firstName + lastName` to `fullName`
- `authorize()`: return `fullName: user.about.fullName`
- JWT callback: `token.fullName = user.fullName`
- Session callback: `session.user.fullName = token.fullName`
- Block login if `passwordSet === false` (redirect to setup-password)

---

## Phase 9: EmployeeForm.tsx

**File:** `app/dashboard/employees/EmployeeForm.tsx`

**Create mode:**
- Single "Full Name" input (replaces firstName + lastName)
- Email input (same)
- Username field → REMOVED from form. Shows auto-derived username below email as hint text: `"Username: ali"` (derived from email in real-time)
- Password + PasswordStrength → REMOVED entirely. User sets password via invite link.
- On submit: sends `{ email, fullName, userRole, department, workShift }`

**Edit mode:**
- Single "Full Name" input
- No email/username fields (same as before — not editable)
- Password field → optional password override (admin can force-set password)

---

## Phase 10: Frontend Interface Updates (firstName/lastName → fullName)

All client-side interfaces change `about: { firstName: string; lastName: string }` to `about: { fullName: string }`.

All display code changes from `${emp.about.firstName} ${emp.about.lastName}` to `emp.about.fullName`.

`initials(firstName, lastName)` → derive from `fullName.split(" ")`.

### Files to update:

| File | Change |
|------|--------|
| `app/dashboard/DashboardShell.tsx` | Session type: `fullName` instead of `firstName + lastName`. Notifications: `p.fullName`. |
| `app/dashboard/DashboardHome.tsx` | User type + PresenceEmployee type + Employee type + Task assignedTo type. Greeting: `user.fullName`. Presence cards: `emp.fullName`. |
| `app/dashboard/employees/page.tsx` | Employee interface. Search, sort, display, initials. |
| `app/dashboard/departments/page.tsx` | Employee/Department interfaces. Manager display. Manager options. Search. |
| `app/dashboard/tasks/page.tsx` | Task/Employee interfaces. Assignee display, options, search. |
| `app/dashboard/settings/page.tsx` | Profile interface. Already uses `fullName` state — just simplify the load to `data.about?.fullName`. Save body: `{ fullName }` directly. |
| `app/api/attendance/presence/route.ts` | Return `fullName` instead of `firstName + lastName`. |
| `app/api/tasks/route.ts` | `.populate("assignedTo", "about.fullName email userRole department")` |
| `app/api/tasks/[id]/route.ts` | `.populate("assignedTo", "about.fullName email userRole")` |
| `app/api/departments/route.ts` | `.populate("manager", "about.fullName email")` |
| `app/api/departments/[id]/route.ts` | `.populate("manager", "about.fullName email")` |
| `scripts/seed.ts` | Change `about: { firstName: "Admin", lastName: "User" }` → `about: { fullName: "Admin User" }`. Add `passwordSet: true`. |

---

## Phase 11: Middleware

**File:** `middleware.ts`

- Allow `/setup-password` as a public route (no auth required)

---

## Phase 12: Seed Script

**File:** `scripts/seed.ts`

- Update to use `about.fullName` and set `passwordSet: true`

---

## Backward Compatibility Note

Existing users in DB have `about.firstName` + `about.lastName`. The model migration:
- Old documents with `about.firstName` + `about.lastName` won't have `about.fullName`
- The `fullName` virtual handles this via fallback: `this.about?.fullName || (this.about?.firstName ? \`${this.about.firstName} ${this.about.lastName}\`.trim() : this.username)`
- On next profile save, the data migrates to `about.fullName`

---

## Files Changed (16+ files)

| File | Type |
|------|------|
| `lib/models/User.ts` | Model: fullName, passwordSet, inviteToken |
| `app/api/employees/route.ts` | Invite flow (no password, token, invite email) |
| `app/api/employees/[id]/route.ts` | fullName update |
| `app/api/employees/[id]/resend/route.ts` | NEW: resend invite |
| `app/api/auth/setup-password/route.ts` | NEW: validate + set password |
| `app/setup-password/page.tsx` | NEW: setup password page |
| `app/api/profile/route.ts` | fullName update |
| `lib/auth.ts` | fullName in session, block passwordSet=false |
| `lib/mail.ts` | sendInviteEmail replaces sendWelcomeEmail |
| `app/dashboard/employees/EmployeeForm.tsx` | fullName, no password, username hint |
| `app/dashboard/DashboardShell.tsx` | fullName in session type |
| `app/dashboard/DashboardHome.tsx` | fullName everywhere |
| `app/dashboard/employees/page.tsx` | fullName in interface + display |
| `app/dashboard/departments/page.tsx` | fullName in interface + display |
| `app/dashboard/tasks/page.tsx` | fullName in interface + display |
| `app/dashboard/settings/page.tsx` | Simplify fullName handling |
| `app/api/attendance/presence/route.ts` | Return fullName |
| `app/api/tasks/route.ts` | Populate fullName |
| `app/api/tasks/[id]/route.ts` | Populate fullName |
| `app/api/departments/route.ts` | Populate fullName |
| `app/api/departments/[id]/route.ts` | Populate fullName |
| `scripts/seed.ts` | fullName + passwordSet |
| `middleware.ts` | Allow /setup-password |
