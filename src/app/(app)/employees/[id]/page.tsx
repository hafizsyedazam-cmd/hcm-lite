import { Employee360 } from "./Employee360";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Employee360 id={id} />;
}
