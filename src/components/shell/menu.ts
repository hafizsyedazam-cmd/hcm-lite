import {
  IconBuildingSkyscraper,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCash,
  IconFileInvoice,
  IconHistory,
  IconLayoutDashboard,
  IconBell,
  IconSettings,
  IconSparkles,
  IconSpeakerphone,
  IconUserCircle,
  IconUsers,
  IconUserShield,
} from "@tabler/icons-react";
import type { Role } from "@/lib/shared/types";

export interface MenuItem {
  label: string | Partial<Record<Role, string>>;
  href: string;
  icon: typeof IconUsers;
  roles: Role[];
}

export const MENU: { title: string; items: MenuItem[] }[] = [
  {
    title: "Main Menu",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: IconLayoutDashboard, roles: ["admin", "hr", "employee"] },
      { label: "AI Assistant", href: "/assistant", icon: IconSparkles, roles: ["admin", "hr", "employee"] },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Employees", href: "/employees", icon: IconUsers, roles: ["admin", "hr"] },
      { label: { admin: "Attendance", hr: "Attendance", employee: "My Attendance" }, href: "/attendance", icon: IconCalendarCheck, roles: ["admin", "hr", "employee"] },
      { label: { admin: "Leave Records", hr: "Leave Requests", employee: "My Leave" }, href: "/leave", icon: IconCalendarEvent, roles: ["admin", "hr", "employee"] },
      { label: "Payroll", href: "/payroll", icon: IconCash, roles: ["admin", "hr"] },
      { label: "My Payslips", href: "/payslips", icon: IconFileInvoice, roles: ["employee"] },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Company Settings", href: "/settings", icon: IconSettings, roles: ["admin"] },
      { label: "Organization Setup", href: "/organization", icon: IconBuildingSkyscraper, roles: ["admin", "hr"] },
      { label: "Users & Logins", href: "/users", icon: IconUserShield, roles: ["admin"] },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Announcements", href: "/announcements", icon: IconSpeakerphone, roles: ["admin", "hr", "employee"] },
      { label: "Notifications", href: "/notifications", icon: IconBell, roles: ["admin", "hr", "employee"] },
      { label: "Audit Log", href: "/audit", icon: IconHistory, roles: ["admin"] },
    ],
  },
  {
    title: "Account",
    items: [{ label: "My Profile", href: "/profile", icon: IconUserCircle, roles: ["admin", "hr", "employee"] }],
  },
];

export function labelFor(item: MenuItem, role: Role) {
  return typeof item.label === "string" ? item.label : (item.label[role] ?? "");
}
