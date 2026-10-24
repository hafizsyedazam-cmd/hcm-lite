"use client";
import { useAuth } from "@/components/AuthProvider";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { EmployeeDashboard } from "@/components/dashboard/EmployeeDashboard";

export default function DashboardPage() {
  const { me } = useAuth();
  if (!me) return null;
  return me.role === "employee" ? <EmployeeDashboard /> : <StaffDashboard role={me.role} />;
}
