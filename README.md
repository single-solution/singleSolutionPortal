# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, iOS 26 Liquid Glass design system
- **Animations**: Framer Motion
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js (Credentials provider)
- **Real-time**: Server-Sent Events (SSE)
- **Storage**: Vercel Blob (profile images)
- **Deployment**: Vercel
- **PWA**: Progressive Web App (installable)

## Roles

| Role | Access |
|------|--------|
| **SuperAdmin** | Full CRUD on employees, departments, tasks, settings; attendance reports |
| **Manager** | Team attendance view, task management, daily/monthly stats |
| **Business Developer** | Job pipeline tracking, personal attendance |
| **Developer** | Personal attendance, calendar view, profile |

## Features

- Geolocation-based office detection (50m radius)
- Socket-based activity sessions with automatic daily/monthly rollup
- Real-time presence board with live status indicators
- CircularProgress attendance widgets
- Priority-based task assignment with deadline tracking
- Department management with manager assignment
- Shift configuration (type, hours, working days, break time)
- Dark/Light/System theme toggle
- Notification system
- CSV export for reports

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000/preview](http://localhost:3000/preview) to see the design previews.

## Project Structure

```
app/
  preview/              # Design preview pages
    page.tsx            # Role tab navigation + floating dock
    components/
      PreviewHeader.tsx        # Sticky header (theme, notifications, user menu)
      LoginPreview.tsx         # Auth login page
      SuperAdminPreview.tsx    # Admin dashboard with inner tabs
      ManagerPreview.tsx       # Manager dashboard with team board
      BDPreview.tsx            # Business Developer dashboard
      DeveloperPreview.tsx     # Developer dashboard with calendar
      SidebarModal.tsx         # Reusable slide-in modal
      DataTablePreview.tsx     # Reusable glass data table
lib/
  motion.ts             # Framer Motion presets (stagger, slide, card, button)
  mockData.ts           # Mock employees, departments, tasks, attendance
```

## Phases

- **Phase 0**: Design previews (completed)
- **Phase 1**: Foundation (MongoDB models, NextAuth, dashboard shell)
- **Phase 2**: Core presence (heartbeat API, geolocation, SSE)
- **Phase 3**: Management (employee CRUD, departments, shifts)
- **Phase 4**: BD tracker & reports (job pipeline, CSV export)
- **Phase 5**: Polish & deploy (PWA, emails, Vercel)

## License

Private — Single Solution
