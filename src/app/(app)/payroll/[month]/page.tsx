import { PayrollRun } from "./PayrollRun";

export default async function Page({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  return <PayrollRun month={month} />;
}
