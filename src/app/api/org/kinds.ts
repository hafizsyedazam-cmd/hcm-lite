import type { ZodType } from "zod";
import { departmentSchema, designationSchema, holidaySchema, leaveTypeSchema } from "@/lib/server/services/org";

export const KINDS = {
  departments: "departments",
  designations: "designations",
  "leave-types": "leaveTypes",
  holidays: "holidays",
} as const;

export type KindSlug = keyof typeof KINDS;

export function isKind(kind: string): kind is KindSlug {
  return kind in KINDS;
}

export function schemaFor(kind: KindSlug): ZodType<Record<string, unknown>> {
  const map = { departments: departmentSchema, designations: designationSchema, "leave-types": leaveTypeSchema, holidays: holidaySchema };
  return map[kind] as unknown as ZodType<Record<string, unknown>>;
}
