"use client";
import { IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";
import { Modal } from "./ui";

/** Shows a temporary password once so HR / Admin can pass it on. */
export function CredentialsNotice({ data, onClose }: { data: { name: string; email: string; password: string } | null; onClose: () => void }) {
  if (!data) return null;
  const text = `HCM Lite login\nEmail: ${data.email}\nTemporary password: ${data.password}\n(You will be asked to set your own password on first sign-in.)`;
  return (
    <Modal
      open
      title="Login created"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-outline-light"
            onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}
          >
            <IconCopy size={16} /> Copy
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="fs-13">
        Share these details with <strong className="text-body-strong">{data.name}</strong>. The temporary password is shown only once; they must change it on first sign-in.
      </p>
      <div className="json-box fs-13">{text}</div>
    </Modal>
  );
}
