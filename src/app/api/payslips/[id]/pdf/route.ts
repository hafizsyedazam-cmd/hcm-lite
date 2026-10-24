import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { payslipPdf } from "@/lib/server/services/payroll";

export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const bytes = await payslipPdf(await authenticate(req), id);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="payslip-${id}.pdf"` },
  });
});
