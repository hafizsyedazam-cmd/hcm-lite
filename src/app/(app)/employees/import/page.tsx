"use client";
import Link from "next/link";
import { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { IconCheck, IconDownload, IconFileSpreadsheet, IconUpload } from "@tabler/icons-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { api, download, errorMessage } from "@/lib/client/api";

interface DryRun {
  total: number;
  validCount: number;
  errors: { row: number; field: string; reason: string }[];
}

export default function ImportPage() {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<DryRun | null>(null);
  const [created, setCreated] = useState<{ code: string; name: string; email: string; tempPassword: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    setFileName(file.name);
    setReport(null);
    setCreated(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: async (res) => {
        setRows(res.data);
        await dryRun(res.data);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const dryRun = async (data: Record<string, string>[]) => {
    setBusy(true);
    try {
      setReport(await api<DryRun>("/employees/import", { body: { rows: data, commit: false } }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await api<{ created: { code: string; name: string; email: string; tempPassword: string }[] }>("/employees/import", { body: { rows, commit: true } });
      setCreated(res.created);
      toast.success(`${res.created.length} employees imported`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const credentialsCsv = () => {
    if (!created) return;
    const csv = ["code,name,email,temporary_password", ...created.map((c) => [c.code, c.name, c.email, c.tempPassword].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "new-logins.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Import employees"
        crumbs={["People", "Employees", "Import CSV"]}
        actions={
          <button className="btn btn-outline-light" onClick={() => download("/employees/template", "employees-template.csv").catch((e) => toast.error(errorMessage(e)))}>
            <IconDownload size={16} /> Download template
          </button>
        }
      />
      <div className="row">
        <div className="col-lg-4">
          <Card title="1. Upload CSV">
            <p className="fs-13">
              Columns: <code>code, name, email, phone, gender, department, designation, join_date, status, basic_salary</code>. Department and designation must match names set by Admin. Dates use YYYY-MM-DD.
            </p>
            <label className="btn btn-primary w-100">
              <IconUpload size={16} /> Choose CSV file
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {fileName && <div className="fs-13 mt-2">Selected: {fileName}</div>}
          </Card>
        </div>
        <div className="col-lg-8">
          <Card title="2. Dry run report" actions={report && report.errors.length === 0 && !created ? <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy}><IconCheck size={15} /> Import {report.validCount} employees</button> : undefined}>
            {!report && !busy && <EmptyState icon={<IconFileSpreadsheet size={26} />} title="No file checked yet" text="Every row is validated first; nothing is saved until you confirm." />}
            {busy && <p className="fs-13">Checking...</p>}
            {report && !created && (
              <>
                <div className="d-flex gap-3 mb-3 fs-13">
                  <span>Rows: <strong className="text-body-strong">{report.total}</strong></span>
                  <span className="text-success">Valid: {report.validCount}</span>
                  <span className="text-danger">Problems: {report.errors.length}</span>
                </div>
                {report.errors.length === 0 ? (
                  <div className="alert alert-success fs-13 mb-0">All rows are valid. Click Import to create the employees and their logins.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Field</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="t-strong">{e.row}</td>
                            <td>{e.field}</td>
                            <td className="text-danger">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {created && (
              <>
                <div className="alert alert-success fs-13">
                  {created.length} employees imported. Download their temporary passwords and share them privately; they must change them on first sign-in.
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-primary" onClick={credentialsCsv}>
                    <IconDownload size={16} /> Download logins
                  </button>
                  <Link href="/employees" className="btn btn-outline-light">
                    Back to employees
                  </Link>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
