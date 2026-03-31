/* ============================================ */
/* MOCK DATA FOR PREVIEW DASHBOARDS             */
/* 10 employees across 3 departments, 4 roles   */
/* ============================================ */

export type EmployeeStatus = "office" | "remote" | "late" | "overtime" | "absent";
export type UserRole = "superadmin" | "manager" | "businessDeveloper" | "developer";
export type ShiftType = "fullTime" | "partTime" | "contract";

export interface Employee {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department: string;
  designation: string;
  status: EmployeeStatus;
  isActive: boolean;
  profileImage?: string;
  shift: {
    type: ShiftType;
    start: string;
    end: string;
    workingDays: string[];
    breakTime: number;
  };
  today: {
    firstEntry: string | null;
    lastExit: string | null;
    officeMinutes: number;
    remoteMinutes: number;
    totalMinutes: number;
    isOnTime: boolean;
    lateBy: number;
    isOvertime: boolean;
    overtimeMinutes: number;
  };
}

export interface DailyRecord {
  date: string;
  status: EmployeeStatus;
  officeMinutes: number;
  remoteMinutes: number;
  totalMinutes: number;
  firstEntry: string;
  lastExit: string;
  isOnTime: boolean;
  lateBy: number;
}

export interface MonthlyStats {
  month: string;
  year: number;
  presentDays: number;
  absentDays: number;
  totalWorkingDays: number;
  onTimeArrivals: number;
  lateArrivals: number;
  onTimePercentage: number;
  totalWorkingHours: number;
  totalOfficeHours: number;
  totalRemoteHours: number;
  averageDailyHours: number;
  averageInTime: string;
  averageOutTime: string;
  attendancePercentage: number;
}

export interface Department {
  _id: string;
  name: string;
  managerId: string;
  employeeCount: number;
  isActive: boolean;
}

export interface BDJob {
  _id: string;
  userId: string;
  jobID: string;
  dateFound: string;
  platform: string;
  clientCompanyName: string;
  clientCountry: string;
  jobTitle: string;
  expectedSalaryBudget: string;
  techStackRequired: string;
  proposalStatus: "draft" | "submitted" | "interviewing" | "accepted" | "rejected" | "archived";
  proposalSentDate: string | null;
  interviewDate: string | null;
  finalStatus: string;
  followUpNeeded: boolean;
}

// --- DEPARTMENTS ---

export const departments: Department[] = [
  { _id: "d1", name: "Engineering", managerId: "e2", employeeCount: 5, isActive: true },
  { _id: "d2", name: "Business Development", managerId: "e3", employeeCount: 3, isActive: true },
  { _id: "d3", name: "Design", managerId: "e2", employeeCount: 2, isActive: true },
];

// --- EMPLOYEES ---

export const employees: Employee[] = [
  {
    _id: "e1", email: "ali@singlesolution.com", username: "ali", firstName: "Ali", lastName: "Ahmed",
    role: "superadmin", department: "Engineering", designation: "CTO",
    status: "office", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "09:52", lastExit: null, officeMinutes: 285, remoteMinutes: 0, totalMinutes: 285, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e2", email: "sarah@singlesolution.com", username: "sarah", firstName: "Sarah", lastName: "Khan",
    role: "manager", department: "Engineering", designation: "Engineering Lead",
    status: "office", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "09:58", lastExit: null, officeMinutes: 278, remoteMinutes: 0, totalMinutes: 278, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e3", email: "hamza@singlesolution.com", username: "hamza", firstName: "Hamza", lastName: "Malik",
    role: "manager", department: "Business Development", designation: "BD Lead",
    status: "late", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "10:48", lastExit: null, officeMinutes: 228, remoteMinutes: 0, totalMinutes: 228, isOnTime: false, lateBy: 18, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e4", email: "fatima@singlesolution.com", username: "fatima", firstName: "Fatima", lastName: "Riaz",
    role: "businessDeveloper", department: "Business Development", designation: "Business Developer",
    status: "office", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "10:05", lastExit: null, officeMinutes: 271, remoteMinutes: 0, totalMinutes: 271, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e5", email: "usman@singlesolution.com", username: "usman", firstName: "Usman", lastName: "Tariq",
    role: "developer", department: "Engineering", designation: "Frontend Developer",
    status: "remote", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "10:12", lastExit: null, officeMinutes: 0, remoteMinutes: 264, totalMinutes: 264, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e6", email: "zara@singlesolution.com", username: "zara", firstName: "Zara", lastName: "Shah",
    role: "developer", department: "Engineering", designation: "Backend Developer",
    status: "overtime", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "09:30", lastExit: null, officeMinutes: 570, remoteMinutes: 0, totalMinutes: 570, isOnTime: true, lateBy: 0, isOvertime: true, overtimeMinutes: 30 },
  },
  {
    _id: "e7", email: "bilal@singlesolution.com", username: "bilal", firstName: "Bilal", lastName: "Hassan",
    role: "businessDeveloper", department: "Business Development", designation: "Business Developer",
    status: "absent", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: null, lastExit: null, officeMinutes: 0, remoteMinutes: 0, totalMinutes: 0, isOnTime: false, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e8", email: "ayesha@singlesolution.com", username: "ayesha", firstName: "Ayesha", lastName: "Noor",
    role: "developer", department: "Design", designation: "UI/UX Designer",
    status: "office", isActive: true,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "10:02", lastExit: null, officeMinutes: 268, remoteMinutes: 0, totalMinutes: 268, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e9", email: "omar@singlesolution.com", username: "omar", firstName: "Omar", lastName: "Farooq",
    role: "developer", department: "Engineering", designation: "Full Stack Developer",
    status: "office", isActive: true,
    shift: { type: "partTime", start: "14:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 30 },
    today: { firstEntry: "14:05", lastExit: null, officeMinutes: 115, remoteMinutes: 0, totalMinutes: 115, isOnTime: true, lateBy: 0, isOvertime: false, overtimeMinutes: 0 },
  },
  {
    _id: "e10", email: "hina@singlesolution.com", username: "hina", firstName: "Hina", lastName: "Rauf",
    role: "developer", department: "Design", designation: "Graphic Designer",
    status: "late", isActive: false,
    shift: { type: "fullTime", start: "10:00", end: "19:00", workingDays: ["monday","tuesday","wednesday","thursday","friday"], breakTime: 60 },
    today: { firstEntry: "11:15", lastExit: null, officeMinutes: 195, remoteMinutes: 0, totalMinutes: 195, isOnTime: false, lateBy: 45, isOvertime: false, overtimeMinutes: 0 },
  },
];

// --- HELPER: stats from employees ---

export function getStatusCounts(emps: Employee[] = employees) {
  const counts = { office: 0, remote: 0, late: 0, overtime: 0, absent: 0, total: emps.length };
  emps.forEach((e) => { counts[e.status]++; });
  return counts;
}

export function getOnTimePct(emps: Employee[] = employees) {
  const present = emps.filter((e) => e.status !== "absent");
  if (!present.length) return 0;
  return Math.round((present.filter((e) => e.today.isOnTime).length / present.length) * 100);
}

// --- MONTHLY STATS (for "me" or any employee) ---

export const monthlyStats: MonthlyStats = {
  month: "March",
  year: 2026,
  presentDays: 18,
  absentDays: 2,
  totalWorkingDays: 22,
  onTimeArrivals: 15,
  lateArrivals: 3,
  onTimePercentage: 83,
  totalWorkingHours: 148.5,
  totalOfficeHours: 132,
  totalRemoteHours: 16.5,
  averageDailyHours: 8.25,
  averageInTime: "10:08",
  averageOutTime: "19:12",
  attendancePercentage: 82,
};

// --- DAILY RECORDS (last 7 days for timeline/calendar) ---

export const weeklyRecords: DailyRecord[] = [
  { date: "2026-03-09", status: "office", officeMinutes: 480, remoteMinutes: 0, totalMinutes: 480, firstEntry: "10:02", lastExit: "19:05", isOnTime: true, lateBy: 0 },
  { date: "2026-03-10", status: "late", officeMinutes: 420, remoteMinutes: 0, totalMinutes: 420, firstEntry: "10:45", lastExit: "18:05", isOnTime: false, lateBy: 15 },
  { date: "2026-03-11", status: "office", officeMinutes: 510, remoteMinutes: 0, totalMinutes: 510, firstEntry: "09:50", lastExit: "19:20", isOnTime: true, lateBy: 0 },
  { date: "2026-03-12", status: "remote", officeMinutes: 0, remoteMinutes: 460, totalMinutes: 460, firstEntry: "10:10", lastExit: "18:40", isOnTime: true, lateBy: 0 },
  { date: "2026-03-13", status: "absent", officeMinutes: 0, remoteMinutes: 0, totalMinutes: 0, firstEntry: "--", lastExit: "--", isOnTime: false, lateBy: 0 },
  { date: "2026-03-14", status: "office", officeMinutes: 285, remoteMinutes: 0, totalMinutes: 285, firstEntry: "09:52", lastExit: "--", isOnTime: true, lateBy: 0 },
];

// --- BD JOBS (for Business Developer role) ---

export const bdJobs: BDJob[] = [
  {
    _id: "j1", userId: "e4", jobID: "UPW-2841", dateFound: "2026-03-01", platform: "Upwork",
    clientCompanyName: "TechForge Inc.", clientCountry: "USA", jobTitle: "Senior React Developer",
    expectedSalaryBudget: "$60-80/hr", techStackRequired: "React, Next.js, Node.js",
    proposalStatus: "interviewing", proposalSentDate: "2026-03-02", interviewDate: "2026-03-15",
    finalStatus: "pending", followUpNeeded: true,
  },
  {
    _id: "j2", userId: "e4", jobID: "LNK-0092", dateFound: "2026-03-05", platform: "LinkedIn",
    clientCompanyName: "DataWave Solutions", clientCountry: "UK", jobTitle: "Full Stack Engineer",
    expectedSalaryBudget: "$4,000-6,000/mo", techStackRequired: "Python, Django, React",
    proposalStatus: "submitted", proposalSentDate: "2026-03-06", interviewDate: null,
    finalStatus: "pending", followUpNeeded: false,
  },
  {
    _id: "j3", userId: "e4", jobID: "UPW-3155", dateFound: "2026-03-08", platform: "Upwork",
    clientCompanyName: "GreenLeaf Digital", clientCountry: "Canada", jobTitle: "Mobile App Developer",
    expectedSalaryBudget: "$50-70/hr", techStackRequired: "React Native, Firebase",
    proposalStatus: "accepted", proposalSentDate: "2026-03-08", interviewDate: "2026-03-11",
    finalStatus: "won", followUpNeeded: false,
  },
  {
    _id: "j4", userId: "e7", jobID: "FVR-7832", dateFound: "2026-03-10", platform: "Fiverr",
    clientCompanyName: "Starter Labs", clientCountry: "Germany", jobTitle: "Backend API Developer",
    expectedSalaryBudget: "$2,500/mo", techStackRequired: "Node.js, Express, MongoDB",
    proposalStatus: "draft", proposalSentDate: null, interviewDate: null,
    finalStatus: "pending", followUpNeeded: false,
  },
  {
    _id: "j5", userId: "e4", jobID: "UPW-2999", dateFound: "2026-02-20", platform: "Upwork",
    clientCompanyName: "CloudMatrix", clientCountry: "Australia", jobTitle: "DevOps Engineer",
    expectedSalaryBudget: "$70-90/hr", techStackRequired: "AWS, Docker, Kubernetes",
    proposalStatus: "rejected", proposalSentDate: "2026-02-21", interviewDate: "2026-02-25",
    finalStatus: "lost", followUpNeeded: false,
  },
  {
    _id: "j6", userId: "e7", jobID: "LNK-0108", dateFound: "2026-03-12", platform: "LinkedIn",
    clientCompanyName: "NovaTech", clientCountry: "UAE", jobTitle: "AI/ML Engineer",
    expectedSalaryBudget: "$8,000-10,000/mo", techStackRequired: "Python, TensorFlow, FastAPI",
    proposalStatus: "submitted", proposalSentDate: "2026-03-13", interviewDate: null,
    finalStatus: "pending", followUpNeeded: true,
  },
];

// --- ACTIVITY TASKS ---

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "inProgress" | "completed";

export interface ActivityTask {
  _id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedRole: UserRole;
  priority: TaskPriority;
  deadline: string;
  status: TaskStatus;
  isActive: boolean;
  createdAt: string;
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "var(--teal)",
  medium: "var(--primary)",
  high: "var(--amber)",
  urgent: "var(--rose)",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  inProgress: "In Progress",
  completed: "Completed",
};

export const activityTasks: ActivityTask[] = [
  {
    _id: "t1", title: "Update landing page hero section", description: "Redesign the hero section with new branding guidelines and illustrations.",
    assignedTo: "e5", assignedRole: "developer", priority: "high", deadline: "2026-03-18",
    status: "inProgress", isActive: true, createdAt: "2026-03-10",
  },
  {
    _id: "t2", title: "Submit proposal for CloudMatrix project", description: "Prepare and submit the technical proposal for the DevOps engagement.",
    assignedTo: "e4", assignedRole: "businessDeveloper", priority: "urgent", deadline: "2026-03-15",
    status: "pending", isActive: true, createdAt: "2026-03-12",
  },
  {
    _id: "t3", title: "Review Q1 attendance reports", description: "Compile and review monthly attendance summaries for all departments.",
    assignedTo: "e2", assignedRole: "manager", priority: "medium", deadline: "2026-03-20",
    status: "pending", isActive: true, createdAt: "2026-03-11",
  },
  {
    _id: "t4", title: "Fix API rate limiting on auth endpoints", description: "Implement rate limiting middleware for login and password reset routes.",
    assignedTo: "e6", assignedRole: "developer", priority: "high", deadline: "2026-03-16",
    status: "completed", isActive: true, createdAt: "2026-03-08",
  },
  {
    _id: "t5", title: "Onboard new designer", description: "Set up accounts, schedule orientation, and assign initial design tasks.",
    assignedTo: "e2", assignedRole: "manager", priority: "low", deadline: "2026-03-22",
    status: "pending", isActive: true, createdAt: "2026-03-13",
  },
  {
    _id: "t6", title: "Follow up with TechForge interview", description: "Send follow-up email and schedule second round if cleared.",
    assignedTo: "e4", assignedRole: "businessDeveloper", priority: "medium", deadline: "2026-03-17",
    status: "inProgress", isActive: true, createdAt: "2026-03-14",
  },
];

// --- AVATAR GRADIENTS (from inventory) ---

export const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
  "from-green-500 to-lime-400",
  "from-fuchsia-500 to-purple-400",
];

export const STATUS_COLORS: Record<EmployeeStatus, string> = {
  office: "#10b981",
  remote: "#007aff",
  late: "#f59e0b",
  overtime: "#8b5cf6",
  absent: "#f43f5e",
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  office: "In Office",
  remote: "Remote",
  late: "Late",
  overtime: "Overtime",
  absent: "Absent",
};

export const STATUS_BADGE_CLASS: Record<EmployeeStatus, string> = {
  office: "badge-office",
  remote: "badge-remote",
  late: "badge-late",
  overtime: "badge-overtime",
  absent: "badge-absent",
};

export function initials(firstName: string, lastName: string) {
  return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "?";
}

export function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
