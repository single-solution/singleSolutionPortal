/**
 * Shared domain types for dashboard and API consumers.
 * `Employee` is the base user shape; `EmployeeCardEmp` is a distinct enriched type for cards / presence (do not merge).
 */

/** Nested profile block used across User / Employee payloads */
export interface EmployeeAbout {
  firstName: string;
  lastName: string;
  phone?: string;
  profileImage?: string;
}

/** Base employee / user record (flat + nested about) */
export interface Employee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  profileImage?: string;
  isActive: boolean;
  isVerified?: boolean;
  phone?: string;
  about: EmployeeAbout;
  isSuperAdmin?: boolean;
}

/** Optional session rows when card data includes same-day activity breakdown */
export interface EmployeeCardSession {
  _id: string;
  time: string;
  inOffice: boolean;
  status: string;
  durationMinutes: number;
}

/**
 * Enriched employee shape for attendance cards and presence views.
 * Includes every field from `EmployeeCard.tsx` plus optional scope / session fields from presence APIs.
 */
export interface EmployeeCardEmp {
  _id: string;
  username?: string;
  firstName: string;
  lastName: string;
  email?: string;
  designation?: string;
  department?: string;
  departmentId?: string | null;
  reportsTo?: string;
  reportsToId?: string | null;
  isLive?: boolean;
  status?: string;
  locationFlagged?: boolean;
  flagReason?: string | null;
  flagCoords?: { lat: number; lng: number } | null;
  firstEntry?: string;
  firstOfficeEntry?: string;
  lastOfficeExit?: string;
  lastExit?: string;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  isLateToOffice?: boolean;
  lateToOfficeBy?: number;
  breakMinutes?: number;
  sessionCount?: number;
  sessions?: EmployeeCardSession[];
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  profileImage?: string;
  isSuperAdmin?: boolean;
  teams?: { _id: string; name: string }[];
  teamIds?: string[];
  weeklySchedule?: Record<string, { isWorking: boolean; start: string; end: string; breakMinutes: number }>;
  shiftType?: string;
  graceMinutes?: number;
  isVerified?: boolean;
  isActive?: boolean;
  pendingTasks?: number;
  inProgressTasks?: number;
  campaigns?: string[];
  /** Shown in list meta when set. */
  phone?: string;
  /** Pre-formatted shift line for list mode. */
  shiftSummary?: string;
}

export interface DepartmentManager {
  _id: string;
  about: { firstName: string; lastName: string };
  email?: string;
}

export interface Department {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  manager?: DepartmentManager;
  parentDepartment?: { _id: string; title: string } | null;
  employeeCount: number;
  teamCount: number;
  isActive: boolean;
  createdAt: string;
}

export type CampaignStatus = "active" | "paused" | "completed" | "cancelled";

export interface TaggedEmployee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
}

export interface TaggedDept {
  _id: string;
  title: string;
}

export interface Campaign {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  budget?: string;
  tags: {
    employees: TaggedEmployee[];
    departments: TaggedDept[];
    /** Legacy — preserved on save when updating a campaign. */
    teams: { _id: string; name: string }[];
  };
  notes?: string;
  isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string;
  updatedAt?: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: {
    _id: string;
    about?: { firstName: string; lastName: string };
    email?: string;
    department?: { _id: string; title: string } | string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface WeeklyDay {
  date: string;
  dayLabel: string;
  present: boolean;
  late: boolean;
  officeMinutes: number;
  remoteMinutes: number;
}

