import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import api from "../services/api";
import "../styles/permanentDelete.css";

const errorText = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : error?.message || "Permanent deletion failed.";
};

export default function PermanentDeleteDialog({
  dresses = [],
  token,
  onClose,
  onDeleted,
  onSessionExpired,
}) {
  const [confirmation, setConfirmation] = useState("");
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [failures, setFailures] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [finished, setFinished] = useState(false);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Auto-dismiss only a fully successful result. Never close a confirmation,
  // in-flight request, or an error/partial failure automatically.
  useEffect(() => {
    if (!finished || processing || failures.length > 0) return;
    const timer = window.setTimeout(() => closeRef.current?.(), 3500);
    return () => window.clearTimeout(timer);
  }, [finished, processing, failures.length]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function confirmDelete() {
    if (confirmation !== "DELETE" || busyRef.current || !dresses.length) {
      return;
    }
    busyRef.current = true;
    setProcessing(true);
    setFailures([]);
    setWarnings([]);
    setCompleted(0);

    const deletedIds = [];
    const errors = [];
    const retainedImages = [];

    try {
      for (let index = 0; index < dresses.length; index++) {
        const dress = dresses[index];
        try {
          const response = await api.delete(
            `/designs/${encodeURIComponent(dress.id)}/permanent`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (response.data?.success !== true || !response.data?.deleted) {
            throw new Error("Server did not confirm deletion.");
          }
          deletedIds.push(dress.id);
          for (const warning of response.data.cleanup_warnings || []) {
            retainedImages.push(`${dress.name}: ${warning}`);
          }
        } catch (error) {
          errors.push(`${dress.name}: ${errorText(error)}`);
          if ([401, 403].includes(error?.response?.status)) {
            onSessionExpired?.();
            break;
          }
        } finally {
          setCompleted(index + 1);
        }
      }
      setFailures(errors);
      setWarnings(retainedImages);
      setFinished(true);
      if (deletedIds.length) onDeleted?.(deletedIds);
    } finally {
      busyRef.current = false;
      setProcessing(false);
    }
  }

  return (
    <div className="pd-backdrop">
      <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="pd-title">
        <button type="button" className="pd-close" onClick={onClose} disabled={processing} aria-label="Close">
          <X size={20} />
        </button>
        {!finished ? (
          <>
            <div className="pd-icon"><AlertTriangle size={24} /></div>
            <h2 id="pd-title">Delete Permanently</h2>
            <p>
              {dresses.length} selected {dresses.length === 1 ? "dress" : "dresses"} will be permanently
              deleted. This cannot be undone. Related completed or failed try-on jobs and AI usage records will also be permanently deleted. Jobs still processing must finish first.
            </p>
          </>
        ) : (
          <h2 id="pd-title">{failures.length ? "Deletion needs attention" : "Deletion completed"}</h2>
        )}
        {!finished && <div className="pd-selection">
          {dresses.map((dress) => (
            <div className="pd-item" key={dress.id}>
              <img src={dress.image_url} alt="" />
              <span>{dress.name}</span>
              <small>{dress.design_code}</small>
            </div>
          ))}
        </div>}
        {!finished && (
          <label className="pd-confirm-label">
            Type <strong>DELETE</strong> to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={processing}
              autoComplete="off"
              placeholder="DELETE"
            />
          </label>
        )}
        {processing && <p role="status">Deleting {completed} of {dresses.length}...</p>}
        {failures.length > 0 && (
          <div className="pd-error" role="alert">{failures.map((item, i) => <p key={i}>{item}</p>)}</div>
        )}
        {warnings.length > 0 && (
          <div className="pd-warning">File cleanup notes: {warnings.map((item, i) => <p key={i}>{item}</p>)}</div>
        )}
        {finished && failures.length === 0 && (
          <div className="pd-success" role="status" aria-live="polite">
            <strong>Deletion completed successfully.</strong>
            <span>This message closes automatically in 3.5 seconds.</span>
          </div>
        )}
        <div className="pd-actions">
          <button type="button" className="pd-cancel" onClick={onClose} disabled={processing}>
            {finished ? "Close" : "Cancel"}
          </button>
          {!finished && (
            <button
              type="button"
              className="pd-delete"
              onClick={confirmDelete}
              disabled={processing || confirmation !== "DELETE"}
            >
              {processing ? <LoaderCircle size={16} className="pd-spin" /> : <Trash2 size={16} />}
              {processing ? "Deleting..." : "Delete Permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
