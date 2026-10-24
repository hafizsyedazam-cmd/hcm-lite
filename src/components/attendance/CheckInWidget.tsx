"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IconCamera, IconLogin2, IconLogout2 } from "@tabler/icons-react";
import { StatusBadge } from "../ui";
import { CameraCheckIn, type CameraResult } from "./CameraCheckIn";
import { api, errorMessage } from "@/lib/client/api";
import { prettyDate, prettyTime } from "@/lib/shared/dates";
import type { AttendanceRecord } from "@/lib/shared/types";

interface Props {
  date: string;
  record: AttendanceRecord | null;
  officeStart: string;
  officeEnd: string;
  camera: { enabled: boolean; radiusM: number };
  onChange: () => void;
}

/** Employee check-in / check-out card. The server stamps the time. */
export function CheckInWidget({ date, record, officeStart, officeEnd, camera, onChange }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the live clock after mount
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const call = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const rec = await api<AttendanceRecord>(path, { body: body ?? {} });
      toast.success(path.endsWith("check-in") ? `Checked in at ${prettyTime(rec.checkIn)}${rec.isLate ? " (late)" : ""}` : `Checked out · ${rec.hours} h worked`);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const cameraSubmit = async (r: CameraResult) => call("/attendance/check-in", { source: "camera", faces: r.faces, location: r.location });

  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5>Attendance</h5>
        <span className="fs-13">{prettyDate(date)}</span>
      </div>
      <div className="card-body text-center">
        <div className="fs-13 mb-1">Office hours {officeStart} – {officeEnd}</div>
        <div className="checkin-clock mb-2" suppressHydrationWarning>
          {now ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
        </div>
        {record ? (
          <div className="mb-3 d-flex flex-column align-items-center gap-1">
            <StatusBadge status={record.status} />
            <div className="fs-13">
              In <strong className="text-body-strong">{prettyTime(record.checkIn)}</strong>
              {record.checkOut && (
                <>
                  {" "}
                  · Out <strong className="text-body-strong">{prettyTime(record.checkOut)}</strong> · {record.hours} h
                </>
              )}
              {record.source === "camera" && <span className="ms-1 badge-soft s-info no-dot">camera</span>}
            </div>
          </div>
        ) : (
          <p className="fs-13 mb-3">You have not checked in today.</p>
        )}
        {!record && (
          <div className="d-flex flex-wrap justify-content-center gap-2">
            <button className="btn btn-primary px-4" disabled={busy} onClick={() => call("/attendance/check-in", { source: "web" }).catch(() => {})}>
              <IconLogin2 size={16} /> Check in
            </button>
            {camera.enabled && (
              <button className="btn btn-secondary-c" disabled={busy} onClick={() => setCameraOpen(true)}>
                <IconCamera size={16} /> Camera check-in
              </button>
            )}
          </div>
        )}
        {record && !record.checkOut && (
          <button className="btn btn-secondary-c px-4" disabled={busy} onClick={() => call("/attendance/check-out").catch(() => {})}>
            <IconLogout2 size={16} /> Check out
          </button>
        )}
        {record?.checkOut && <div className="fs-13 text-success">Done for today. See you tomorrow!</div>}
      </div>
      <CameraCheckIn open={cameraOpen} onClose={() => setCameraOpen(false)} onSubmit={cameraSubmit} radiusM={camera.radiusM} />
    </div>
  );
}
