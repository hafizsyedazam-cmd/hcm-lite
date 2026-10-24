"use client";
import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Card, Field, PageHeader, RoleBadge, StatusBadge, money } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { auth } from "@/lib/client/firebase";
import { prettyDate } from "@/lib/shared/dates";
import type { Employee } from "@/lib/shared/types";

type View = Employee & { departmentName: string; designationName: string; salary?: { basic: number; gross: number } };

export default function ProfilePage() {
  const { me } = useAuth();
  const { data: emp, reload } = useApi<View>(me?.employeeId ? `/employees/${me.employeeId}` : null);
  const [contact, setContact] = useState({ phone: "", address: "" });
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy loaded profile into the form
    if (emp) setContact({ phone: emp.phone, address: emp.address });
  }, [emp]);

  if (!me) return null;

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/profile", { method: "PUT", body: contact });
      toast.success("Contact details saved");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.password !== pw.confirm) return toast.error("The two passwords do not match");
    setBusy(true);
    try {
      await api("/me/password", { body: { password: pw.password } });
      await signInWithEmailAndPassword(auth, me.email, pw.password);
      setPw({ password: "", confirm: "" });
      toast.success("Password changed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My Profile" crumbs={["Account", "My Profile"]} />
      <div className="row">
        <div className="col-xl-4">
          <div className="card">
            <div className="card-body text-center">
              <Avatar name={me.name} size="xl" />
              <h4 className="mt-3 mb-1">{me.name}</h4>
              <div className="fs-13 mb-2">{me.email}</div>
              <RoleBadge role={me.role} />
              {emp && (
                <div className="text-start fs-13 mt-3 d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between"><span>Code</span><span className="text-body-strong">{emp.code}</span></div>
                  <div className="d-flex justify-content-between"><span>Department</span><span className="text-body-strong">{emp.departmentName}</span></div>
                  <div className="d-flex justify-content-between"><span>Designation</span><span className="text-body-strong">{emp.designationName}</span></div>
                  <div className="d-flex justify-content-between"><span>Joined</span><span className="text-body-strong">{prettyDate(emp.joinDate)}</span></div>
                  <div className="d-flex justify-content-between"><span>Status</span><StatusBadge status={emp.status} /></div>
                  {emp.salary && <div className="d-flex justify-content-between"><span>Gross salary</span><span className="text-body-strong">{money(emp.salary.gross)}</span></div>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-8">
          {emp && (
            <Card title="Contact details">
              <form onSubmit={saveContact} className="row">
                <Field label="Phone" className="col-md-6">
                  <input className="form-control" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} maxLength={30} />
                </Field>
                <Field label="Address" className="col-md-6">
                  <input className="form-control" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} maxLength={200} />
                </Field>
                <div className="col-12">
                  <p className="fs-12">Other details (job, salary) can only be changed by HR.</p>
                  <button className="btn btn-primary" disabled={busy}>Save contact details</button>
                </div>
              </form>
            </Card>
          )}
          <div id="password">
            <Card title="Change password">
              <form onSubmit={changePassword} className="row">
                <Field label="New password" className="col-md-6" hint="At least 8 characters.">
                  <input type="password" className="form-control" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password" className="col-md-6">
                  <input type="password" className="form-control" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} autoComplete="new-password" />
                </Field>
                <div className="col-12">
                  <button className="btn btn-primary" disabled={busy}>Change password</button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
