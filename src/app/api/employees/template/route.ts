import { CSV_TEMPLATE } from "@/lib/server/services/employees";

export function GET() {
  return new Response(CSV_TEMPLATE, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="employees-template.csv"' },
  });
}
