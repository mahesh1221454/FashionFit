
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCheck,
  CircleAlert,
  FolderOpen,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import api from "../services/api";

// =====================================================
// API
// =====================================================

const TRASH_ENDPOINT = "/designs/management/trash";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchTrash(token) {
  const response = await api.get(TRASH_ENDPOINT, {
    headers: authHeaders(token),
  });

  if (!Array.isArray(response.data)) {
    throw new Error("Invalid Trash response from server.");
  }

  return response.data;
}

async function restoreDesign(designId, token) {
  const response = await api.post(
    `/designs/${encodeURIComponent(designId)}/restore`,
    null,
    {
      headers: authHeaders(token),
    }
  );

  if (response.data?.success !== true) {
    throw new Error("The server did not confirm restoration.");
  }

  return response.data;
}

function errorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  return error?.message || "An unexpected error occurred.";
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =====================================================
// RESTORE CONFIRMATION
// =====================================================

function RestoreDialog({
  dresses,
  processing,
  progress,
  error,
  onClose,
  onConfirm,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape" && !processing) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [processing, onClose]);

  return (
    <div
      className="tm-overlay"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !processing
        ) {
          onClose();
        }
      }}
    >
      <div
        className="tm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-dialog-title"
      >
        <button
          className="tm-modal-close"
          type="button"
          onClick={onClose}
          disabled={processing}
          aria-label="Close confirmation"
        >
          <X size={17} />
        </button>

        <div className="tm-modal-icon">
          <RotateCcw size={23} />
        </div>

        <span className="tm-eyebrow">
          RESTORE COLLECTION DESIGNS
        </span>

        <h2 id="tm-dialog-title">
          Restore{" "}
          {dresses.length === 1
            ? "this dress?"
            : `${dresses.length} dresses?`}
        </h2>

        <p className="tm-modal-description">
          The selected designs will return to their
          original categories and become visible in
          the active collection again.
        </p>

        <div className="tm-preview-list">
          {dresses.map((dress) => (
            <div className="tm-preview-row" key={dress.id}>
              <div className="tm-preview-image">
                {dress.image_url ? (
                  <img src={dress.image_url} alt="" />
                ) : (
                  <ImageOff size={20} />
                )}
              </div>

              <div className="tm-preview-copy">
                <strong>{dress.name}</strong>
                <span>{dress.category_name}</span>
              </div>

              <Check size={16} />
            </div>
          ))}
        </div>

        <div className="tm-notice">
          <ShieldCheck size={18} />
          <span>
            Existing images and AI generation history
            will remain associated with each dress.
          </span>
        </div>

        {processing && progress && (
          <div className="tm-progress">
            <div>
              <span>Restoring dresses</span>
              <strong>
                {progress.completed}/{progress.total}
              </strong>
            </div>
            <progress
              value={progress.completed}
              max={progress.total}
            />
          </div>
        )}

        {error && (
          <div className="tm-error" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="tm-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="tm-btn tm-btn-secondary"
            onClick={onClose}
            disabled={processing}
          >
            Cancel
          </button>

          <button
            type="button"
            className="tm-btn tm-btn-primary"
            onClick={onConfirm}
            disabled={processing || dresses.length === 0}
          >
            {processing ? (
              <LoaderCircle
                size={17}
                className="tm-spin"
              />
            ) : (
              <RotateCcw size={17} />
            )}

            {processing
              ? "Restoring..."
              : dresses.length === 1
              ? "Confirm Restore"
              : `Restore ${dresses.length} Dresses`}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// TRASH MANAGEMENT PAGE
// =====================================================

export default function TrashManagement({
  accessToken,
  onBack,
  onSessionExpired,
  onBusyChange,
}) {
  const [dresses, setDresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const [confirmationIds, setConfirmationIds] =
    useState([]);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [restoreProgress, setRestoreProgress] =
    useState(null);

  const requestIdRef = useRef(0);
  const restoringRef = useRef(false);

  const loadTrash = useCallback(
    async (quiet = false) => {
      const requestId = ++requestIdRef.current;

      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const records = await fetchTrash(accessToken);

        if (requestId !== requestIdRef.current) return;

        setDresses(records);

        const existingIds = new Set(
          records.map((item) => String(item.id))
        );

        setSelectedIds((previous) =>
          previous.filter((id) =>
            existingIds.has(String(id))
          )
        );
      } catch (err) {
        if (requestId !== requestIdRef.current) return;

        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          onSessionExpired?.();
        }

        setError(errorMessage(err));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, onSessionExpired]
  );

  useEffect(() => {
    loadTrash();

    return () => {
      ++requestIdRef.current;
    };
  }, [loadTrash]);

  const filteredDresses = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return dresses;

    return dresses.filter((dress) =>
      [
        dress.name,
        dress.design_code,
        dress.category_name,
      ].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [dresses, search]);

  const selectedSet = useMemo(
    () => new Set(selectedIds.map(String)),
    [selectedIds]
  );

  const selectedDresses = useMemo(
    () =>
      dresses.filter((dress) =>
        selectedSet.has(String(dress.id))
      ),
    [dresses, selectedSet]
  );

  const confirmationSet = useMemo(
    () => new Set(confirmationIds.map(String)),
    [confirmationIds]
  );

  const confirmationDresses = useMemo(
    () =>
      dresses.filter((dress) =>
        confirmationSet.has(String(dress.id))
      ),
    [dresses, confirmationSet]
  );

  const visibleAllSelected =
    filteredDresses.length > 0 &&
    filteredDresses.every((dress) =>
      selectedSet.has(String(dress.id))
    );

  const toggleSelection = (id) => {
    if (restoringRef.current) return;

    setSelectedIds((previous) => {
      const existing = new Set(previous.map(String));

      if (existing.has(String(id))) {
        return previous.filter(
          (item) => String(item) !== String(id)
        );
      }

      return [...previous, id];
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredDresses.map(
      (dress) => String(dress.id)
    );

    const visibleSet = new Set(visibleIds);

    if (visibleAllSelected) {
      setSelectedIds((previous) =>
        previous.filter(
          (id) => !visibleSet.has(String(id))
        )
      );
    } else {
      setSelectedIds((previous) =>
        Array.from(
          new Set([
            ...previous.map(String),
            ...visibleIds,
          ])
        )
      );
    }
  };

  const openRestoreDialog = (ids) => {
    if (restoringRef.current || ids.length === 0) return;

    setConfirmationIds(ids);
    setRestoreError("");
    setRestoreProgress(null);
    setRestoreOpen(true);
  };

  const closeRestoreDialog = useCallback(() => {
    if (restoringRef.current) return;

    setRestoreOpen(false);
    setConfirmationIds([]);
    setRestoreError("");
  }, []);

  const confirmRestore = async () => {
    if (
      restoringRef.current ||
      confirmationDresses.length === 0
    ) {
      return;
    }

    restoringRef.current = true;
    setRestoring(true);
    onBusyChange?.(true);

    setRestoreError("");
    setNotice("");

    const targets = [...confirmationDresses];
    const successes = [];
    const failures = [];

    setRestoreProgress({
      completed: 0,
      total: targets.length,
    });

    try {
      for (let index = 0; index < targets.length; index++) {
        const dress = targets[index];

        try {
          const result = await restoreDesign(
            dress.id,
            accessToken
          );

          // restored:false with success:true means
          // it is no longer in Trash. Treat it as
          // reconciled, not as an outstanding failure.
          successes.push({
            dress,
            result,
          });
        } catch (err) {
          failures.push({
            dress,
            message: errorMessage(err),
          });

          if (
            err.response?.status === 401 ||
            err.response?.status === 403
          ) {
            onSessionExpired?.();

            for (
              let remaining = index + 1;
              remaining < targets.length;
              remaining++
            ) {
              failures.push({
                dress: targets[remaining],
                message:
                  "Not attempted because administrator authentication expired.",
              });
            }

            break;
          }
        }

        setRestoreProgress({
          completed: index + 1,
          total: targets.length,
        });
      }

      const successfulIds = new Set(
        successes.map((item) => String(item.dress.id))
      );

      setDresses((previous) =>
        previous.filter(
          (dress) => !successfulIds.has(String(dress.id))
        )
      );

      setSelectedIds((previous) =>
        previous.filter(
          (id) => !successfulIds.has(String(id))
        )
      );

      setConfirmationIds((previous) =>
        previous.filter(
          (id) => !successfulIds.has(String(id))
        )
      );

      if (successes.length > 0) {
        setNotice(
          `${successes.length} ${
            successes.length === 1 ? "dress" : "dresses"
          } restored successfully.`
        );
      }

      if (failures.length > 0) {
        setRestoreError(
          failures
            .map(
              ({ dress, message }) =>
                `${dress.name}: ${message}`
            )
            .join("\n")
        );

        setRestoreProgress(null);
      } else {
        setRestoreOpen(false);
        setConfirmationIds([]);
        setRestoreError("");
        setRestoreProgress(null);
      }
    } catch (err) {
      setRestoreError(errorMessage(err));
    } finally {
      restoringRef.current = false;
      setRestoring(false);
      onBusyChange?.(false);
    }
  };

  return (
    <section className="tm-root">
      <div className="tm-topline">
        <button
          type="button"
          className="tm-back"
          onClick={onBack}
          disabled={restoring}
        >
          <ArrowLeft size={17} />
          Back to Collection
        </button>

        <span className="tm-admin-indicator">
          <ShieldCheck size={15} />
          Administrator Access
        </span>
      </div>

      <div className="tm-heading">
        <div>
          <span className="tm-eyebrow">
            COLLECTION MANAGEMENT
          </span>

          <h1>Trash Bin</h1>

          <p>
            Recover removed dresses while preserving
            their original images, categories and AI
            generation history.
          </p>
        </div>

        <button
          type="button"
          className="tm-btn tm-btn-secondary"
          disabled={loading || refreshing || restoring}
          onClick={() => loadTrash(true)}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "tm-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="tm-stats">
        <div className="tm-stat">
          <div className="tm-stat-icon">
            <Archive size={19} />
          </div>

          <div>
            <strong>{dresses.length}</strong>
            <span>Items in Trash</span>
          </div>
        </div>

        <div className="tm-stat">
          <div className="tm-stat-icon tm-stat-orange">
            <CheckCheck size={19} />
          </div>

          <div>
            <strong>{selectedDresses.length}</strong>
            <span>Selected Dresses</span>
          </div>
        </div>

        <div className="tm-stat">
          <div className="tm-stat-icon tm-stat-neutral">
            <FolderOpen size={19} />
          </div>

          <div>
            <strong>
              {
                new Set(
                  dresses.map((dress) =>
                    String(dress.category_id)
                  )
                ).size
              }
            </strong>
            <span>Original Categories</span>
          </div>
        </div>
      </div>

      {notice && (
        <div className="tm-success" role="status">
          <Check size={17} />
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="tm-error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="tm-section">
        <div className="tm-section-head">
          <div>
            <h2>Removed Designs</h2>
            <p>
              Select individual dresses or restore
              multiple designs at once.
            </p>
          </div>

          <div className="tm-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search dresses or categories"
              aria-label="Search trashed dresses"
            />
          </div>
        </div>

        {!loading && filteredDresses.length > 0 && (
          <div className="tm-selection-bar">
            <label className="tm-select-all">
              <input
                type="checkbox"
                checked={visibleAllSelected}
                disabled={restoring}
                onChange={toggleAllVisible}
              />

              <span>
                {visibleAllSelected
                  ? "Deselect Visible"
                  : "Select All Visible"}
              </span>
            </label>

            <div className="tm-selection-actions">
              <span>
                {selectedDresses.length} selected
              </span>

              {selectedDresses.length > 0 && (
                <>
                  <button
                    type="button"
                    className="tm-clear"
                    disabled={restoring}
                    onClick={() => setSelectedIds([])}
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    className="tm-btn tm-btn-primary"
                    disabled={restoring}
                    onClick={() =>
                      openRestoreDialog(
                        selectedDresses.map(
                          (dress) => dress.id
                        )
                      )
                    }
                  >
                    <RotateCcw size={15} />
                    Restore Selected
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="tm-empty">
            <LoaderCircle
              size={28}
              className="tm-spin"
            />
            <strong>Loading Trash...</strong>
            <p>Retrieving removed designs.</p>
          </div>
        ) : filteredDresses.length === 0 ? (
          <div className="tm-empty">
            <div className="tm-empty-icon">
              {search ? (
                <Search size={28} />
              ) : (
                <Trash2 size={28} />
              )}
            </div>

            <strong>
              {search
                ? "No matching dresses"
                : "Your Trash is empty"}
            </strong>

            <p>
              {search
                ? "Try another dress name, code or category."
                : "Dresses moved to Trash will appear here."}
            </p>
          </div>
        ) : (
          <div className="tm-grid">
            {filteredDresses.map((dress) => {
              const selected = selectedSet.has(
                String(dress.id)
              );

              return (
                <article
                  key={dress.id}
                  className={
                    "tm-card" +
                    (selected ? " tm-card-selected" : "")
                  }
                >
                  <div className="tm-image-wrap">
                    {dress.image_url ? (
                      <img
                        src={dress.image_url}
                        alt={dress.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="tm-image-placeholder">
                        <ImageOff size={27} />
                      </div>
                    )}

                    <label className="tm-card-check">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={restoring}
                        onChange={() =>
                          toggleSelection(dress.id)
                        }
                        aria-label={`Select ${dress.name}`}
                      />
                    </label>

                    <span className="tm-card-tag">
                      <Trash2 size={12} />
                      In Trash
                    </span>
                  </div>

                  <div className="tm-card-body">
                    <h3 title={dress.name}>
                      {dress.name}
                    </h3>

                    <span className="tm-design-code">
                      {dress.design_code}
                    </span>

                    <div className="tm-card-meta">
                      <div>
                        <FolderOpen size={14} />
                        <span title={dress.category_name}>
                          {dress.category_name}
                        </span>
                      </div>

                      <div>
                        <CalendarDays size={14} />
                        <span>
                          {formatDate(dress.trashed_at)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="tm-restore-button"
                      disabled={restoring}
                      onClick={() =>
                        openRestoreDialog([dress.id])
                      }
                    >
                      <RotateCcw size={16} />
                      Restore Dress
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {restoreOpen && (
        <RestoreDialog
          dresses={confirmationDresses}
          processing={restoring}
          progress={restoreProgress}
          error={restoreError}
          onClose={closeRestoreDialog}
          onConfirm={confirmRestore}
        />
      )}

      <style>{TRASH_STYLES}</style>
    </section>
  );
}

// =====================================================
// COMPONENT STYLES
// =====================================================

const TRASH_STYLES = `
.tm-root {
  width: 100%;
  padding-bottom: 56px;
  color: #18181b;
  font-family: inherit;
}

.tm-root * {
  box-sizing: border-box;
}

.tm-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.tm-back {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 0;
  background: transparent;
  color: #52525b;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.tm-back:hover {
  color: #ea580c;
}

.tm-back:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.tm-admin-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #dcfce7;
  border-radius: 30px;
  padding: 7px 11px;
  background: #f0fdf4;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
}

.tm-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 23px;
}

.tm-eyebrow {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.4px;
}

.tm-heading h1 {
  margin: 6px 0 8px;
  color: #18181b;
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: -.8px;
}

.tm-heading p {
  margin: 0;
  color: #71717a;
  font-size: 12px;
  line-height: 1.6;
}

.tm-btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 39px;
  padding: 9px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background .2s, border-color .2s;
}

.tm-btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.tm-btn-secondary {
  border-color: #e4e4e7;
  background: #fff;
  color: #3f3f46;
}

.tm-btn-secondary:hover:not(:disabled) {
  background: #fafafa;
  border-color: #d4d4d8;
}

.tm-btn-primary {
  background: #f97316;
  color: #fff;
}

.tm-btn-primary:hover:not(:disabled) {
  background: #ea580c;
}

.tm-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 23px;
}

.tm-stat {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 16px;
  border: 1px solid #eaeaec;
  border-radius: 14px;
  background: #fff;
}

.tm-stat-icon {
  flex: 0 0 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: #fef2f2;
  color: #dc2626;
}

.tm-stat-orange {
  background: #fff7ed;
  color: #ea580c;
}

.tm-stat-neutral {
  background: #f4f4f5;
  color: #52525b;
}

.tm-stat > div:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tm-stat strong {
  font-size: 23px;
  font-weight: 800;
  line-height: 1.2;
}

.tm-stat span {
  color: #71717a;
  font-size: 11px;
}

.tm-section {
  padding: 18px;
  border: 1px solid #eaeaec;
  border-radius: 16px;
  background: #fff;
}

.tm-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 18px;
}

.tm-section-head h2 {
  margin: 0 0 5px;
  color: #18181b;
  font-size: 17px;
  font-weight: 750;
}

.tm-section-head p {
  margin: 0;
  color: #a1a1aa;
  font-size: 11px;
}

.tm-search {
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(100%, 275px);
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fafafa;
  color: #a1a1aa;
}

.tm-search:focus-within {
  border-color: #fb923c;
  background: #fff;
}

.tm-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #18181b;
  font-family: inherit;
  font-size: 12px;
}

.tm-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 17px;
  padding: 10px 12px;
  border: 1px solid #ffedd5;
  border-radius: 10px;
  background: #fffaf5;
}

.tm-select-all {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #52525b;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.tm-select-all input,
.tm-card-check input {
  width: 16px;
  height: 16px;
  accent-color: #f97316;
  cursor: pointer;
}

.tm-selection-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.tm-selection-actions > span {
  color: #9a3412;
  font-size: 11px;
  font-weight: 650;
}

.tm-clear {
  border: 0;
  background: transparent;
  color: #71717a;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.tm-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
}

.tm-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #eaeaec;
  border-radius: 13px;
  background: #fff;
  transition:
    box-shadow .2s,
    border-color .2s,
    transform .2s;
}

.tm-card:hover {
  border-color: #fdba74;
  box-shadow: 0 8px 25px rgba(24,24,27,.07);
  transform: translateY(-2px);
}

.tm-card-selected {
  border-color: #f97316;
  box-shadow: 0 0 0 1px #f97316;
}

.tm-image-wrap {
  position: relative;
  height: clamp(145px, 16vw, 205px);
  overflow: hidden;
  background: #f4f4f5;
}

.tm-image-wrap > img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.tm-image-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: #a1a1aa;
}

.tm-card-check {
  position: absolute;
  top: 10px;
  left: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  background: rgba(255,255,255,.96);
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(0,0,0,.08);
}

.tm-card-tag {
  position: absolute;
  top: 11px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border: 1px solid #fecaca;
  border-radius: 999px;
  background: rgba(255,255,255,.96);
  color: #b91c1c;
  font-size: 10px;
  font-weight: 750;
}

.tm-card-body {
  padding: 13px;
}

.tm-card-body h3 {
  overflow: hidden;
  margin: 0 0 5px;
  color: #27272a;
  font-size: 13px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-design-code {
  display: block;
  overflow: hidden;
  color: #a1a1aa;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-card-meta {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 13px 0;
  padding-top: 12px;
  border-top: 1px solid #f4f4f5;
}

.tm-card-meta > div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #71717a;
  font-size: 11px;
}

.tm-card-meta svg {
  flex-shrink: 0;
  color: #a1a1aa;
}

.tm-card-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-restore-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 37px;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  background: #fff7ed;
  color: #c2410c;
  font-family: inherit;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.tm-restore-button:hover:not(:disabled) {
  background: #ffedd5;
  border-color: #fb923c;
}

.tm-restore-button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.tm-empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  min-height: 240px;
  text-align: center;
  gap: 10px;
  color: #71717a;
}

.tm-empty-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f4f4f5;
  color: #a1a1aa;
}

.tm-empty strong {
  color: #3f3f46;
  font-size: 15px;
}

.tm-empty p {
  max-width: 260px;
  margin: 0;
  color: #a1a1aa;
  font-size: 12px;
  line-height: 1.6;
}

.tm-success,
.tm-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.6;
}

.tm-success {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.tm-error {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.tm-error span,
.tm-success span {
  flex: 1;
  white-space: pre-line;
}

.tm-success > button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

/* Modal */

.tm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(24,24,27,.58);
  backdrop-filter: blur(5px);
}

.tm-modal {
  position: relative;
  width: min(100%, 455px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 25px;
  border: 1px solid #e4e4e7;
  border-radius: 19px;
  background: #fff;
  box-shadow: 0 25px 70px rgba(0,0,0,.2);
}

.tm-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fff;
  color: #71717a;
  cursor: pointer;
}

.tm-modal-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 14px;
  border-radius: 13px;
  background: #f0fdf4;
  color: #16a34a;
}

.tm-modal h2 {
  margin: 6px 0 0;
  color: #18181b;
  font-size: 21px;
  font-weight: 800;
}

.tm-modal-description {
  margin: 11px 0 17px;
  color: #71717a;
  font-size: 12px;
  line-height: 1.65;
}

.tm-preview-list {
  max-height: min(205px, 30dvh);
  overflow-y: auto;
  border: 1px solid #e4e4e7;
  border-radius: 11px;
}

.tm-preview-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 11px;
  border-bottom: 1px solid #f4f4f5;
}

.tm-preview-row:last-child {
  border-bottom: 0;
}

.tm-preview-image {
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  height: 43px;
  overflow: hidden;
  border-radius: 7px;
  background: #f4f4f5;
  color: #a1a1aa;
}

.tm-preview-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tm-preview-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.tm-preview-copy strong,
.tm-preview-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-preview-copy strong {
  color: #27272a;
  font-size: 12px;
}

.tm-preview-copy span {
  color: #a1a1aa;
  font-size: 11px;
}

.tm-preview-row > svg {
  color: #16a34a;
  flex-shrink: 0;
}

.tm-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 11px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.55;
}

.tm-notice svg {
  flex-shrink: 0;
  color: #16a34a;
}

.tm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.tm-progress {
  margin-top: 14px;
  color: #52525b;
  font-size: 11px;
}

.tm-progress > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.tm-progress progress {
  width: 100%;
  height: 7px;
  margin-top: 7px;
  accent-color: #f97316;
}

.tm-spin {
  animation: tm-spin 850ms linear infinite;
}

@keyframes tm-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .tm-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 800px) {
  .tm-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-stats {
    gap: 9px;
  }

  .tm-stat {
    padding: 12px;
    gap: 9px;
  }

  .tm-stat-icon {
    flex-basis: 37px;
    height: 37px;
  }

  .tm-stat strong {
    font-size: 19px;
  }
}

@media (max-width: 560px) {
  .tm-topline,
  .tm-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .tm-stats {
    grid-template-columns: 1fr;
  }

  .tm-section {
    padding: 12px;
  }

  .tm-search {
    width: 100%;
  }

  .tm-grid {
    gap: 10px;
  }

  .tm-image-wrap {
    height: 155px;
  }

  .tm-card-body {
    padding: 10px;
  }

  .tm-card-tag {
    font-size: 9px;
    padding: 5px 7px;
  }

  .tm-modal {
    padding: 19px;
  }
}

@media (max-width: 380px) {
  .tm-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tm-spin {
    animation: none;
  }
}
`;
