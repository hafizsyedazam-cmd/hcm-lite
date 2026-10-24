"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconCurrentLocation, IconDeviceFloppy } from "@tabler/icons-react";
import { Card, ErrorState, Field, PageHeader, PageLoading } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { WEEKDAYS } from "@/lib/shared/dates";
import type { CompanySettings } from "@/lib/shared/types";

export default function SettingsPage() {
  const params = useSearchParams();
  const { data, error, loading, reload } = useApi<CompanySettings>("/settings");
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy loaded settings into the editable form
    if (data) setForm(data);
  }, [data]);

  if (loading && !form) return <PageLoading />;
  if (error || !form) return <div className="card"><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setForm({ ...form, [k]: v });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { setupComplete: _s, createdAt: _c, ...body } = form;
      void _s;
      void _c;
      await api("/settings", { method: "PUT", body });
      toast.success("Settings saved. New rules apply to new records.");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => (f ? { ...f, officeLat: Number(p.coords.latitude.toFixed(6)), officeLng: Number(p.coords.longitude.toFixed(6)) } : f));
        toast.success(`Location captured (accuracy ${Math.round(p.coords.accuracy)} m)`);
      },
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Company Settings"
        crumbs={["Organization", "Company Settings"]}
        actions={
          <button className="btn btn-primary" disabled={saving}>
            <IconDeviceFloppy size={16} /> {saving ? "Saving..." : "Save settings"}
          </button>
        }
      />
      {params.get("welcome") && (
        <div className="alert alert-success fs-13">
          Company created! Next steps: check the office rules below, then add <Link href="/organization">departments and leave types</Link> and <Link href="/users">create an HR login</Link>.
        </div>
      )}
      <div className="row">
        <div className="col-xl-6">
          <Card title="Company profile">
            <Field label="Company name">
              <input className="form-control" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} required minLength={2} />
            </Field>
            <div className="row">
              <Field label="Time zone" className="col-md-7">
                <input className="form-control" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} required />
              </Field>
              <Field label="Currency" className="col-md-5">
                <input className="form-control" value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} required maxLength={5} />
              </Field>
            </div>
          </Card>
          <Card title="Office hours & attendance rules">
            <div className="row">
              <Field label="Office start" className="col-md-6">
                <input type="time" className="form-control" value={form.officeStart} onChange={(e) => set("officeStart", e.target.value)} required />
              </Field>
              <Field label="Office end" className="col-md-6">
                <input type="time" className="form-control" value={form.officeEnd} onChange={(e) => set("officeEnd", e.target.value)} required />
              </Field>
              <Field label="Grace time (minutes)" className="col-md-6" hint={`Late after ${form.officeStart} + ${form.graceMinutes} min`}>
                <input type="number" className="form-control" min={0} max={180} value={form.graceMinutes} onChange={(e) => set("graceMinutes", Number(e.target.value))} required />
              </Field>
              <Field label="Half day under (hours)" className="col-md-6">
                <input type="number" className="form-control" min={1} max={12} step={0.5} value={form.halfDayHours} onChange={(e) => set("halfDayHours", Number(e.target.value))} required />
              </Field>
            </div>
            <Field label="Weekend days">
              <div className="d-flex flex-wrap gap-3">
                {WEEKDAYS.map((d, i) => (
                  <div className="form-check" key={d}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`wd${i}`}
                      checked={form.weekend.includes(i)}
                      onChange={(e) => set("weekend", e.target.checked ? [...form.weekend, i] : form.weekend.filter((x) => x !== i))}
                    />
                    <label className="form-check-label fs-13" htmlFor={`wd${i}`}>{d.slice(0, 3)}</label>
                  </div>
                ))}
              </div>
            </Field>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="penalty" checked={form.latePenalty} onChange={(e) => set("latePenalty", e.target.checked)} />
              <label className="form-check-label fs-13" htmlFor="penalty">Late penalty: every 3 late arrivals in a month deduct 0.5 day</label>
            </div>
            <p className="fs-12 mt-3 mb-0">Rule changes apply to new attendance records only; existing records keep the rules they were stamped with.</p>
          </Card>
        </div>
        <div className="col-xl-6">
          <Card
            title="Office location (camera attendance)"
            actions={
              <button type="button" className="btn btn-outline-light btn-sm" onClick={captureLocation}>
                <IconCurrentLocation size={15} /> Use my current location
              </button>
            }
          >
            <p className="fs-13">Employees can check in with the camera only when one face is detected and their phone is inside this radius. The server measures the distance (Haversine).</p>
            <div className="row">
              <Field label="Latitude" className="col-md-6">
                <input type="number" step="any" className="form-control" value={form.officeLat ?? ""} onChange={(e) => set("officeLat", e.target.value === "" ? null : Number(e.target.value))} placeholder="24.8607" />
              </Field>
              <Field label="Longitude" className="col-md-6">
                <input type="number" step="any" className="form-control" value={form.officeLng ?? ""} onChange={(e) => set("officeLng", e.target.value === "" ? null : Number(e.target.value))} placeholder="67.0011" />
              </Field>
              <Field label="Allowed radius (metres)" className="col-md-6">
                <input type="number" className="form-control" min={20} max={5000} value={form.radiusM} onChange={(e) => set("radiusM", Number(e.target.value))} required />
              </Field>
            </div>
            {form.officeLat != null && form.officeLng != null && (
              <iframe
                title="Office location map"
                className="w-100 rounded border"
                style={{ height: 240 }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${form.officeLng - 0.005}%2C${form.officeLat - 0.003}%2C${form.officeLng + 0.005}%2C${form.officeLat + 0.003}&layer=mapnik&marker=${form.officeLat}%2C${form.officeLng}`}
              />
            )}
          </Card>
        </div>
      </div>
    </form>
  );
}
