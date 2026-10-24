// Domain types shared by the API (server) and the screens (client).

export type Role = "admin" | "hr" | "employee";

export type DayStatus =
  | "present"
  | "late"
  | "half_day"
  | "missing_checkout"
  | "absent"
  | "on_leave"
  | "weekend"
  | "holiday"
  | "upcoming"
  | "not_joined";

export interface CompanySettings {
  companyName: string;
  officeStart: string; // "09:00"
  officeEnd: string; // "18:00"
  graceMinutes: number;
  halfDayHours: number;
  weekend: number[]; // 0 = Sunday ... 6 = Saturday
  timezone: string;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
  latePenalty: boolean; // bonus rule: 3 lates = 0.5 day
  currency: string;
  setupComplete: boolean;
  createdAt?: string;
}

export interface Department {
  id: string;
  name: string;
  createdAt: string;
}

export interface Designation {
  id: string;
  name: string;
  departmentId: string | null;
  createdAt: string;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string; // annual | sick | casual | unpaid | custom
  quota: number | null; // null = unlimited
  paid: boolean;
  createdAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface UserDoc {
  uid: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export type EmployeeStatus = "probation" | "active" | "exited";

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  gender: "male" | "female" | "other";
  departmentId: string;
  designationId: string | null;
  joinDate: string;
  exitDate: string | null;
  status: EmployeeStatus;
  basic: number;
  uid: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string; // ISO timestamp stamped by the server
  checkOut: string | null;
  checkInMin: number; // minutes after local midnight (company timezone)
  checkOutMin: number | null;
  status: "present" | "late" | "half_day";
  isLate: boolean;
  lateMinutes: number;
  hours: number | null;
  source: "web" | "camera" | "correction";
  location?: { lat: number; lng: number; accuracy: number; distanceM: number } | null;
  rules: { officeStart: string; graceMinutes: number; halfDayHours: number };
}

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn: string; // "HH:MM"
  checkOut: string; // "HH:MM"
  reason: string;
  status: "pending" | "approved" | "rejected";
  comment: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  start: string;
  end: string;
  days: number;
  dates: string[]; // working days covered
  reason: string;
  status: LeaveStatus;
  comment: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  source: "form" | "ai";
  createdAt: string;
}

export interface LeaveBalance {
  typeId: string;
  code: string;
  name: string;
  quota: number | null;
  used: number;
  pending: number;
  remaining: number | null;
  paid: boolean;
}

export interface PayrollRun {
  id: string; // "YYYY-MM"
  month: string;
  status: "draft" | "finalized";
  workingDays: number;
  totals: { employees: number; gross: number; deductions: number; tax: number; net: number };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
}

export interface Payslip {
  id: string; // "YYYY-MM_employeeId"
  month: string;
  runStatus: "draft" | "finalized";
  employeeId: string;
  employeeName: string;
  code: string;
  departmentId: string;
  designationId: string | null;
  basic: number;
  hra: number;
  medical: number;
  gross: number;
  workingDays: number;
  payableDays: number;
  earnedGross: number;
  perDay: number;
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  lateCount: number;
  latePenaltyDays: number;
  deduction: number;
  annualTaxable: number;
  tax: number;
  net: number;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdByRole: Role;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  uid: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  at: string;
}

export interface Me {
  uid: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  mustChangePassword: boolean;
  companyName: string;
}
