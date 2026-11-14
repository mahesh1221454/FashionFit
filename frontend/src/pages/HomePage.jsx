
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router-dom";

import {
  Check,
  CheckCheck,
  EyeOff,
  FolderInput,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Pencil,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import DesignGrid from "../components/DesignGrid";
import TrashManagement from "../components/TrashManagement";
import PermanentDeleteDialog from "../components/PermanentDeleteDialog";
import EditDressDialog from "../components/EditDressDialog";
import CollectionDashboard from "../components/CollectionDashboard";

import {
  CollectionActionDialog,
  HiddenManagement,
} from "../components/CollectionActions";

import {
  getCategories,
  getDesigns,
  loginCollectionAdmin,
  moveMultipleDesignsToTrash,
} from "../services/api";

import "../styles/collectionManagement.css";

const DEFAULT_USERNAME =
  import.meta.env.VITE_COLLECTION_ADMIN_LABEL || "";

function readError(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }
  return error?.message || "Something went wrong.";
}

// =====================================================
// ADMIN LOGIN
// =====================================================

function AdminLoginDialog({
  onClose,
  onLogin,
  loading,
  error,
}) {
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, onClose]);

  return (
    <div className="cm-backdrop">
      <div
        className="cm-dialog cm-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-login-title"
      >
        <button
          type="button"
          className="cm-close"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="cm-icon cm-icon-orange">
          <LockKeyhole size={23} />
        </div>

        <span className="cm-eyebrow">
          SECURE COLLECTION ACCESS
        </span>
        <h2 id="cm-login-title">Administrator Login</h2>
        <p className="cm-description">
          Sign in to access collection management,
          dashboard statistics and administrator tools.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin({ username, password });
          }}
        >
          <label className="cm-form-field">
            <span>Username</span>
            <input
              ref={inputRef}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={150}
              disabled={loading}
              placeholder="Administrator username"
            />
          </label>

          <label className="cm-form-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
              placeholder="Administrator password"
            />
          </label>

          {error && (
            <div className="cm-error" role="alert">{error}</div>
          )}

          <div className="cm-dialog-actions">
            <button
              type="button"
              className="cm-btn cm-btn-outline"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="cm-btn cm-btn-primary"
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle size={16} className="cm-spinner" />
              ) : (
                <KeyRound size={16} />
              )}
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>

        <div className="cm-login-footnote">
          <ShieldCheck size={15} />
          Authentication is verified by FastAPI.
        </div>
      </div>
    </div>
  );
}

// =====================================================
// TRASH CONFIRMATION
// =====================================================

function TrashConfirmation({
  dresses,
  onClose,
  onConfirm,
  processing,
  progress,
  error,
}) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape" && !processing) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [processing, onClose]);

  return (
    <div className="cm-backdrop">
      <div
        className="cm-dialog cm-trash-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-trash-title"
      >
        <button
          type="button"
          className="cm-close"
          disabled={processing}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="cm-dialog-header">
          <div className="cm-icon cm-icon-danger">
            <Trash2 size={21} />
          </div>
          <div>
            <span className="cm-eyebrow">
              COLLECTION MANAGEMENT
            </span>
            <h2 id="cm-trash-title">Move to Trash?</h2>
          </div>
        </div>

        <p className="cm-description">
          Move <strong>{dresses.length}</strong>{" "}
          {dresses.length === 1 ? "dress" : "dresses"}
          {" "}out of the active gallery.
        </p>

        <div className="cm-selected-panel">
          <div className="cm-selected-heading">
            <strong>Selected Dresses</strong>
            <span>{dresses.length}</span>
          </div>

          <div className="cm-selected-list">
            {dresses.map((dress) => (
              <div className="cm-selected-item" key={dress.id}>
                <img src={dress.image_url} alt="" />
                <div>
                  <strong>{dress.name}</strong>
                  <small>{dress.design_code}</small>
                </div>
                <Check size={16} />
              </div>
            ))}
          </div>
        </div>

        <div className="cm-information">
          <ShieldCheck size={19} />
          <p>
            Image files and existing AI generation records
            are preserved. You can restore these dresses
            from the Trash Bin later.
          </p>
        </div>

        {processing && progress && (
          <div className="cm-progress">
            <span>
              Processing {progress.completed} of {progress.total}
            </span>
            <progress
              max={progress.total}
              value={progress.completed}
            />
          </div>
        )}

        {error && (
          <div className="cm-error" role="alert">{error}</div>
        )}

        <div className="cm-dialog-actions">
          <button
            type="button"
            className="cm-btn cm-btn-outline"
            disabled={processing}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-danger"
            disabled={processing || dresses.length === 0}
            onClick={onConfirm}
          >
            {processing ? (
              <LoaderCircle size={16} className="cm-spinner" />
            ) : (
              <Trash2 size={16} />
            )}
            {processing
              ? "Moving to Trash..."
              : "Confirm Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MAIN HOME PAGE
// =====================================================

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const requestRef = useRef(0);
  const trashBusyRef = useRef(false);

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // FASHION_NOTICE_AUTODISMISS_V1: Success notices disappear after 3.5 seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // collection | dashboard | hidden | trash
  const [managementView, setManagementView] =
    useState("collection");
  const [subviewBusy, setSubviewBusy] = useState(false);

  const [adminToken, setAdminToken] = useState("");
  const [adminExpiresAt, setAdminExpiresAt] = useState(0);
  const [adminUsername, setAdminUsername] = useState("");

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentTargets, setPermanentTargets] = useState([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashProcessing, setTrashProcessing] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [trashProgress, setTrashProgress] = useState(null);

  const [actionOperation, setActionOperation] = useState(null);
  const [actionTargets, setActionTargets] = useState([]);
  const [editDress, setEditDress] = useState(null);

  const sessionValid = () =>
    Boolean(adminToken) && Date.now() < adminExpiresAt;

  const expireSession = useCallback(() => {
    setAdminToken("");
    setAdminExpiresAt(0);
    setAdminUsername("");
    setManageMode(false);
    setManagementView("collection");
    setSelectedIds([]);
  }, []);

  const leaveManageMode = useCallback(() => {
    if (trashBusyRef.current) return;

    setManageMode(false);
    setSelectedIds([]);
    setManagementView("collection");
    setTrashOpen(false);
    setActionOperation(null);
    setActionTargets([]);
    setEditDress(null);
  }, []);

  // ===================================================
  // INITIAL DATA LOADING
  // ===================================================

  useEffect(() => {
    let active = true;
    const requestId = ++requestRef.current;

    async function loadInitial() {
      setLoading(true);
      setError("");

      try {
        const categoryData = await getCategories();
        if (!active || requestId !== requestRef.current) return;

        if (!Array.isArray(categoryData)) {
          throw new Error("Invalid category response.");
        }

        setCategories(categoryData);

        const requestedId = location.state?.categoryId;
        const category =
          categoryData.find(
            (item) => String(item.id) === String(requestedId)
          ) ||
          categoryData[0] ||
          null;

        setSelectedCategory(category);

        if (!category) {
          setDesigns([]);
          return;
        }

        const designData = await getDesigns(category.id);

        if (!active || requestId !== requestRef.current) return;

        if (!Array.isArray(designData)) {
          throw new Error("Invalid design response.");
        }

        setDesigns(designData);
      } catch (err) {
        if (active && requestId === requestRef.current) {
          setError(readError(err));
        }
      } finally {
        if (active && requestId === requestRef.current) {
          setLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      active = false;
      ++requestRef.current;
    };
  }, [location.key, location.state?.categoryId]);

  // ===================================================
  // CATEGORY / GALLERY
  // ===================================================

  const loadCategoryDesigns = useCallback(
    async (category) => {
      if (
        trashBusyRef.current ||
        subviewBusy ||
        actionOperation ||
        editDress
      ) return;

      const requestId = ++requestRef.current;

      leaveManageMode();
      setSelectedCategory(category);
      setDesigns([]);
      setLoading(true);
      setError("");
      setNotice("");

      try {
        if (!category) {
          setDesigns([]);
          return;
        }

        const response = await getDesigns(category.id);

        if (requestId !== requestRef.current) return;

        if (!Array.isArray(response)) {
          throw new Error("Invalid design response.");
        }

        setDesigns(response);
      } catch (err) {
        if (requestId === requestRef.current) {
          setError(readError(err));
        }
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      }
    },
    [
      leaveManageMode,
      subviewBusy,
      actionOperation,
      editDress,
    ]
  );

  const refreshGallery = useCallback(async () => {
    if (!selectedCategory) return;

    const requestId = ++requestRef.current;
    setLoading(true);

    try {
      const response = await getDesigns(selectedCategory.id);

      if (requestId !== requestRef.current) return;
      if (!Array.isArray(response)) {
        throw new Error("Invalid gallery response.");
      }

      setDesigns(response);
      setError("");
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(readError(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [selectedCategory]);

  // ===================================================
  // ADMINISTRATOR LOGIN
  // ===================================================

  function handleManageClick() {
    if (
      trashBusyRef.current ||
      subviewBusy ||
      actionOperation ||
      editDress
    ) return;

    if (manageMode) {
      leaveManageMode();
      return;
    }

    setLoginError("");

    if (sessionValid()) {
      setManageMode(true);
      setSelectedIds([]);
    } else {
      expireSession();
      setLoginOpen(true);
    }
  }

  async function handleAdminLogin(credentials) {
    if (loginLoading) return;

    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await loginCollectionAdmin(credentials);
      const seconds = Number(response.expires_in);

      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error("Invalid administrator session lifetime.");
      }

      setAdminToken(response.access_token);
      setAdminExpiresAt(Date.now() + seconds * 1000);
      setAdminUsername(response.username || "");
      setLoginOpen(false);
      setManageMode(true);
      setManagementView("collection");
      setSelectedIds([]);
      setNotice("");
    } catch (err) {
      setLoginError(readError(err));
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    if (
      trashBusyRef.current ||
      subviewBusy ||
      actionOperation ||
      editDress
    ) return;

    expireSession();
    leaveManageMode();
    setNotice("Administrator session ended.");
  }

  // ===================================================
  // DESIGN SELECTION
  // ===================================================

  const selectedDesigns = designs.filter((design) =>
    selectedIds.some((id) => String(id) === String(design.id))
  );

  const allSelected =
    designs.length > 0 &&
    selectedIds.length === designs.length;

  function toggleSelected(designId) {
    if (editDress || actionOperation) return;

    setSelectedIds((previous) =>
      previous.some((id) => String(id) === String(designId))
        ? previous.filter(
            (id) => String(id) !== String(designId)
          )
        : [...previous, designId]
    );
  }

  function toggleSelectAll() {
    setSelectedIds(
      allSelected ? [] : designs.map((design) => design.id)
    );
  }

  // ===================================================
  // EDIT DRESS
  // ===================================================

  function openEditDialog() {
    if (selectedDesigns.length !== 1) return;

    if (!sessionValid()) {
      expireSession();
      setLoginError("Session expired. Sign in again.");
      setLoginOpen(true);
      return;
    }

    setEditDress({ ...selectedDesigns[0] });
  }

  function handleEditSaved(result) {
    const editedId = String(result.design_id);
    const moved =
      String(result.category_id) !==
      String(selectedCategory?.id);

    setDesigns((previous) =>
      moved
        ? previous.filter(
            (design) => String(design.id) !== editedId
          )
        : previous.map((design) =>
            String(design.id) === editedId
              ? {
                  ...design,
                  name: result.name,
                  category_id: result.category_id,
                  image_url: result.image_url || design.image_url,
                }
              : design
          )
    );

    setSelectedIds([]);
    setEditDress(null);
    setNotice(
      moved
        ? `Dress updated and moved to ${result.category_name}.`
        : "Dress details saved successfully."
    );

    void refreshGallery();
  }

  // ===================================================
  // MOVE / HIDE
  // ===================================================

  function openCollectionAction(operation) {
    if (!selectedDesigns.length) return;

    if (!sessionValid()) {
      expireSession();
      setLoginError("Session expired. Sign in again.");
      setLoginOpen(true);
      return;
    }

    setActionTargets([...selectedDesigns]);
    setActionOperation(operation);
  }

  function handleActionComplete(result) {
    const successfulIds = new Set(
      result.successful.map((item) => String(item.design.id))
    );

    setDesigns((previous) =>
      previous.filter(
        (design) => !successfulIds.has(String(design.id))
      )
    );
    setSelectedIds((previous) =>
      previous.filter((id) => !successfulIds.has(String(id)))
    );

    if (result.successful.length) {
      setNotice(
        `${result.successful.length} ${
          result.successful.length === 1 ? "dress" : "dresses"
        } ${
          actionOperation === "move"
            ? "moved successfully."
            : "hidden successfully."
        }`
      );
    }

    if (result.authExpired) expireSession();
  }

  // ===================================================
  // TRASH
  // ===================================================

  function openTrashDialog() {
    if (!selectedDesigns.length) return;
    setTrashError("");
    setTrashProgress(null);
    setTrashOpen(true);
  }

  async function confirmTrash() {
    if (
      trashBusyRef.current ||
      selectedDesigns.length === 0
    ) return;

    if (!sessionValid()) {
      setTrashOpen(false);
      expireSession();
      setLoginError("Session expired. Sign in again.");
      setLoginOpen(true);
      return;
    }

    trashBusyRef.current = true;
    setTrashProcessing(true);
    setTrashError("");
    setTrashProgress({
      completed: 0,
      total: selectedDesigns.length,
    });

    try {
      const result = await moveMultipleDesignsToTrash({
        designs: selectedDesigns,
        accessToken: adminToken,
        onProgress: setTrashProgress,
      });

      const completedIds = new Set(
        result.successful.map((item) => String(item.design.id))
      );

      setDesigns((previous) =>
        previous.filter(
          (design) => !completedIds.has(String(design.id))
        )
      );
      setSelectedIds((previous) =>
        previous.filter((id) => !completedIds.has(String(id)))
      );

      if (result.authExpired) expireSession();

      if (result.failed.length) {
        setTrashError(
          result.failed.map(
            (item) => `${item.design.name}: ${item.error}`
          ).join("\n")
        );
        return;
      }

      setTrashOpen(false);
      setSelectedIds([]);
      setNotice(
        `${result.successful.length} ${
          result.successful.length === 1 ? "dress" : "dresses"
        } moved to Trash.`
      );

      await refreshGallery();
    } catch (err) {
      setTrashError(readError(err));
    } finally {
      trashBusyRef.current = false;
      setTrashProcessing(false);
    }
  }

  // ===================================================
  // PERMANENT DELETE
  // ===================================================

  function openPermanentDeleteDialog() {
    if (!selectedDesigns.length) return;
    if (!sessionValid()) {
      expireSession();
      setLoginError("Session expired. Sign in again.");
      setLoginOpen(true);
      return;
    }
    setPermanentTargets([...selectedDesigns]);
    setPermanentDeleteOpen(true);
  }

  function handlePermanentlyDeleted(ids) {
    const deleted = new Set(ids.map(String));
    setDesigns((current) => current.filter((d) => !deleted.has(String(d.id))));
    setSelectedIds((current) => current.filter((id) => !deleted.has(String(id))));
    setNotice(`${ids.length} ${ids.length === 1 ? "dress" : "dresses"} permanently deleted.`);
    void refreshGallery();
  }

  // ===================================================
  // MANAGEMENT NAVIGATION
  // ===================================================

  function openManagementView(view) {
    if (trashBusyRef.current || subviewBusy) return;

    if (!sessionValid()) {
      expireSession();
      setLoginError("Please sign in again.");
      setLoginOpen(true);
      return;
    }

    setSelectedIds([]);
    setManagementView(view);
  }

  async function returnToCollection() {
    if (subviewBusy) return;

    setManagementView("collection");
    setSelectedIds([]);
    await refreshGallery();

    if (!sessionValid()) expireSession();
  }

  async function openCategoryFromDashboard(category) {
    if (!category || !sessionValid()) {
      expireSession();
      return;
    }

    const requestId = ++requestRef.current;

    setManagementView("collection");
    setSelectedCategory(category);
    setSelectedIds([]);
    setDesigns([]);
    setLoading(true);
    setError("");

    try {
      const response = await getDesigns(category.id);

      if (requestId !== requestRef.current) return;

      if (!Array.isArray(response)) {
        throw new Error("Invalid design response.");
      }

      setDesigns(response);
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(readError(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }


  // FF_CATEGORY_DELETE_V1
  async function handleCategoryDeleted(deletedCategoryId) {
    const nextCategories = await getCategories();

    if (!Array.isArray(nextCategories)) {
      throw new Error("Invalid categories response.");
    }

    setCategories(nextCategories);

    const selectedStillExists = nextCategories.some(
      (category) =>
        String(category.id) === String(selectedCategory?.id)
    );

    if (
      !selectedStillExists ||
      String(selectedCategory?.id) === String(deletedCategoryId)
    ) {
      const requestId = ++requestRef.current;

      const fallback = nextCategories[0] || null;

      setSelectedCategory(fallback);
      setSelectedIds([]);
      setDesigns([]);

      if (fallback) {
        const response = await getDesigns(fallback.id);

        if (requestId === requestRef.current) {
          if (!Array.isArray(response)) {
            throw new Error(
              "Invalid gallery response after category deletion."
            );
          }

          setDesigns(response);
        }
      }
    }

    setNotice("Category deleted successfully.");
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <>
      <div className="portal-layout">
        <Sidebar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={loadCategoryDesigns}
        />

        <main
          className={
            "portal-content" +
            (manageMode
              ? " collection-managing-content"
              : "")
          }
        >
          {managementView === "dashboard" &&
          manageMode &&
          adminToken ? (
            <CollectionDashboard
              accessToken={adminToken}
              onBack={returnToCollection}
              onCategory={openCategoryFromDashboard}
              onCategoryDeleted={handleCategoryDeleted}
              onNavigate={openManagementView}
              onSessionExpired={expireSession}
            />
          ) : managementView === "trash" &&
            manageMode &&
            adminToken ? (
            <TrashManagement
              accessToken={adminToken}
              onBack={returnToCollection}
              onBusyChange={setSubviewBusy}
              onSessionExpired={expireSession}
            />
          ) : managementView === "hidden" &&
            manageMode &&
            adminToken ? (
            <HiddenManagement
              token={adminToken}
              onBack={returnToCollection}
              onBusyChange={setSubviewBusy}
              onSessionExpired={expireSession}
            />
          ) : (
            <>
              <div className="page-header collection-page-header">
                <div className="collection-header-copy">
                  <span>Explore Collection</span>
                  <h1>
                    {selectedCategory?.name ||
                      "Fashion Collection"}
                  </h1>
                  <p>
                    {manageMode
                      ? "Select dresses to edit, move, hide or manage."
                      : "Select a design to create your personalized AI fashion preview."}
                  </p>
                </div>

                {selectedCategory && !loading && (
                  <div className="cm-header-actions">
                    {adminToken && sessionValid() && (
                      <button
                        type="button"
                        className="cm-logout-button"
                        onClick={handleLogout}
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                    )}

                    {manageMode && (
                      <>
                        <button
                          type="button"
                          className="collection-manage-button"
                          onClick={() =>
                            openManagementView("dashboard")
                          }
                        >
                          <LayoutDashboard size={16} />
                          Dashboard
                        </button>

                        <button
                          type="button"
                          className="collection-manage-button"
                          onClick={() =>
                            openManagementView("hidden")
                          }
                        >
                          <EyeOff size={16} />
                          Hidden Dresses
                        </button>

                        <button
                          type="button"
                          className="collection-manage-button"
                          onClick={() =>
                            openManagementView("trash")
                          }
                        >
                          <Trash2 size={16} />
                          Trash Bin
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className={
                        "collection-manage-button" +
                        (manageMode ? " active" : "")
                      }
                      onClick={handleManageClick}
                    >
                      {manageMode ? (
                        <>
                          <Check size={17} />
                          Done
                        </>
                      ) : (
                        <>
                          <Settings2 size={17} />
                          Manage Collection
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {notice && (
                <div
                  className="cm-success-message"
                  role="status"
                >
                  <Check size={18} />
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

              {manageMode && (
                <div className="collection-management-bar">
                  <div className="collection-management-description">
                    <CheckCheck size={18} />
                    <span>
                      Manage selected collection designs
                    </span>
                  </div>

                  <div className="collection-selection-actions">
                    <span className="collection-selection-count">
                      {selectedIds.length} of {designs.length} selected
                    </span>
                    <button
                      type="button"
                      className="collection-text-action"
                      onClick={toggleSelectAll}
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                    {selectedIds.length > 0 && !allSelected && (
                      <button
                        type="button"
                        className="collection-text-action"
                        onClick={() => setSelectedIds([])}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="custom-error" role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={refreshGallery}
                  >
                    Retry
                  </button>
                </div>
              )}

              {loading ? (
                <div className="loading">
                  Loading collection...
                </div>
              ) : !selectedCategory ? (
                <div className="empty-state">
                  No categories available.
                </div>
              ) : (
                <DesignGrid
                  designs={designs}
                  manageMode={manageMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelected}
                  onDesignClick={(design) =>
                    navigate(`/design/${design.id}`)
                  }
                />
              )}
            </>
          )}
        </main>
      </div>

      {manageMode && managementView === "collection" && (
        <div
          className="collection-floating-toolbar"
          role="toolbar"
          aria-label="Collection management"
        >
          <div className="collection-toolbar-count">
            <strong>{selectedIds.length} selected</strong>
            <span>Manage designs</span>
          </div>

          <div className="collection-toolbar-divider" />

          <div className="collection-toolbar-actions">
            <button
              type="button"
              className="collection-toolbar-action"
              disabled={selectedIds.length !== 1}
              onClick={openEditDialog}
              title="Select one dress to edit"
            >
              <Pencil size={16} />
              Edit
            </button>

            <button
              type="button"
              className="collection-toolbar-action"
              disabled={!selectedIds.length}
              onClick={() => openCollectionAction("move")}
            >
              <FolderInput size={16} />
              Move
            </button>

            <button
              type="button"
              className="collection-toolbar-action"
              disabled={!selectedIds.length}
              onClick={() => openCollectionAction("hide")}
            >
              <EyeOff size={16} />
              Hide
            </button>

            <button
              type="button"
              className="collection-toolbar-action danger"
              disabled={!selectedIds.length}
              onClick={openTrashDialog}
            >
              <Trash2 size={16} />
              Move to Trash
            </button>

            <button
              type="button"
              className="collection-toolbar-action danger"
              disabled={!selectedIds.length}
              onClick={openPermanentDeleteDialog}
            >
              <Trash2 size={16} />
              Delete Permanently
            </button>
          </div>

          <button
            type="button"
            className="collection-toolbar-close"
            onClick={leaveManageMode}
            aria-label="Exit management mode"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {loginOpen && (
        <AdminLoginDialog
          onClose={() => {
            if (!loginLoading) {
              setLoginOpen(false);
              setLoginError("");
            }
          }}
          onLogin={handleAdminLogin}
          loading={loginLoading}
          error={loginError}
        />
      )}

      {permanentDeleteOpen && (
        <PermanentDeleteDialog
          dresses={permanentTargets}
          token={adminToken}
          onClose={() => {
            setPermanentDeleteOpen(false);
            setPermanentTargets([]);
          }}
          onDeleted={handlePermanentlyDeleted}
          onSessionExpired={expireSession}
        />
      )}

      {trashOpen && (
        <TrashConfirmation
          dresses={selectedDesigns}
          onClose={() => {
            if (!trashBusyRef.current) {
              setTrashOpen(false);
              setTrashError("");
            }
          }}
          onConfirm={confirmTrash}
          processing={trashProcessing}
          progress={trashProgress}
          error={trashError}
        />
      )}

      {actionOperation && (
        <CollectionActionDialog
          operation={actionOperation}
          designs={actionTargets}
          categories={categories}
          sourceCategoryId={selectedCategory?.id}
          token={adminToken}
          onClose={() => {
            setActionOperation(null);
            setActionTargets([]);
          }}
          onComplete={handleActionComplete}
          onSessionExpired={expireSession}
        />
      )}

      {editDress && (
        <EditDressDialog
          dress={editDress}
          categories={categories}
          accessToken={adminToken}
          onClose={() => setEditDress(null)}
          onSaved={handleEditSaved}
          onSessionExpired={expireSession}
        />
      )}
    </>
  );
}
