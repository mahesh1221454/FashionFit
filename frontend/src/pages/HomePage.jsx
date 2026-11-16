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
    <div className="cm-backdrop backdrop-blur-md bg-black/80 transition-all duration-300">
      <div
        className="cm-dialog cm-login-dialog bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl rounded-2xl p-8 max-w-md w-full relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-login-title"
      >
        <button
          type="button"
          className="cm-close absolute top-5 right-5 text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 p-2 rounded-full"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="cm-icon cm-icon-orange w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
          <LockKeyhole size={23} />
        </div>

        <span className="cm-eyebrow text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-1 block">
          SECURE COLLECTION ACCESS
        </span>
        <h2 id="cm-login-title" className="text-2xl font-bold tracking-tight text-white mb-2">Administrator Login</h2>
        <p className="cm-description text-sm text-zinc-400 mb-6">
          Sign in to access collection management,
          dashboard statistics and administrator tools.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin({ username, password });
          }}
        >
          <label className="cm-form-field block mb-4">
            <span className="block text-xs font-medium text-zinc-300 mb-1.5">Username</span>
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
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all"
            />
          </label>

          <label className="cm-form-field block mb-6">
            <span className="block text-xs font-medium text-zinc-300 mb-1.5">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
              placeholder="Administrator password"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all"
            />
          </label>

          {error && (
            <div className="cm-error bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs mb-6 flex items-center gap-2" role="alert">{error}</div>
          )}

          <div className="cm-dialog-actions flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="cm-btn cm-btn-outline px-5 py-2.5 rounded-xl text-sm font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="cm-btn cm-btn-primary px-5 py-2.5 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors flex items-center gap-2 font-semibold disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle size={16} className="cm-spinner animate-spin" />
              ) : (
                <KeyRound size={16} />
              )}
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>

        <div className="cm-login-footnote mt-6 pt-6 border-t border-zinc-800/80 flex items-center gap-2 text-xs text-zinc-500">
          <ShieldCheck size={15} className="text-amber-400/70" />
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
    <div className="cm-backdrop backdrop-blur-md bg-black/80 transition-all duration-300">
      <div
        className="cm-dialog cm-trash-dialog bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl rounded-2xl p-8 max-w-lg w-full relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-trash-title"
      >
        <button
          type="button"
          className="cm-close absolute top-5 right-5 text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 p-2 rounded-full"
          disabled={processing}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="cm-dialog-header flex items-center gap-4 mb-4">
          <div className="cm-icon cm-icon-danger w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
            <Trash2 size={21} />
          </div>
          <div>
            <span className="cm-eyebrow text-xs font-semibold uppercase tracking-wider text-red-400 mb-0.5 block">
              COLLECTION MANAGEMENT
            </span>
            <h2 id="cm-trash-title" className="text-2xl font-bold tracking-tight text-white">Move to Trash?</h2>
          </div>
        </div>

        <p className="cm-description text-sm text-zinc-400 mb-6">
          Move <strong className="text-white font-semibold">{dresses.length}</strong>{" "}
          {dresses.length === 1 ? "dress" : "dresses"}
          {" "}out of the active gallery.
        </p>

        <div className="cm-selected-panel bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 mb-6">
          <div className="cm-selected-heading flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-xs font-medium text-zinc-400">
            <strong>Selected Dresses</strong>
            <span className="bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-300">{dresses.length}</span>
          </div>

          <div className="cm-selected-list max-h-48 overflow-y-auto space-y-2 pr-1">
            {dresses.map((dress) => (
              <div className="cm-selected-item flex items-center justify-between gap-3 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/50" key={dress.id}>
                <div className="flex items-center gap-3">
                  <img src={dress.image_url} alt="" className="w-10 h-10 object-cover rounded-md border border-zinc-800" />
                  <div>
                    <strong className="block text-xs font-semibold text-white truncate max-w-[200px]">{dress.name}</strong>
                    <small className="text-[10px] text-zinc-500">{dress.design_code}</small>
                  </div>
                </div>
                <Check size={16} className="text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="cm-information bg-zinc-950/60 border border-zinc-800/50 rounded-xl p-4 flex items-start gap-3 mb-6 text-xs text-zinc-400">
          <ShieldCheck size={19} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Image files and existing AI generation records
            are preserved. You can restore these dresses
            from the Trash Bin later.
          </p>
        </div>

        {processing && progress && (
          <div className="cm-progress mb-6">
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>
                Processing {progress.completed} of {progress.total}
              </span>
              <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
            </div>
            <progress
              max={progress.total}
              value={progress.completed}
              className="w-full h-2 rounded-full overflow-hidden bg-zinc-950 accent-amber-500"
            />
          </div>
        )}

        {error && (
          <div className="cm-error bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs mb-6" role="alert">{error}</div>
        )}

        <div className="cm-dialog-actions flex items-center justify-end gap-3">
          <button
            type="button"
            className="cm-btn cm-btn-outline px-5 py-2.5 rounded-xl text-sm font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            disabled={processing}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-danger px-5 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-2 font-semibold disabled:opacity-50"
            disabled={processing || dresses.length === 0}
            onClick={onConfirm}
          >
            {processing ? (
              <LoaderCircle size={16} className="cm-spinner animate-spin" />
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
      <div className="portal-layout min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row antialiased selection:bg-amber-500/30 selection:text-amber-200">
        <Sidebar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={loadCategoryDesigns}
        />

        <main
          className={
            "portal-content flex-1 flex flex-col min-w-0 p-6 md:p-10 transition-all duration-300" +
            (manageMode
              ? " collection-managing-content pb-28"
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
              <div className="page-header collection-page-header flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-zinc-800/80">
                <div className="collection-header-copy">
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-2 block">Explore Collection</span>
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-2 font-serif">
                    {selectedCategory?.name ||
                      "Fashion Collection"}
                  </h1>
                  <p className="text-sm text-zinc-400 max-w-xl">
                    {manageMode
                      ? "Select dresses to edit, move, hide or manage."
                      : "Select a design to create your personalized AI fashion preview."}
                  </p>
                </div>

                {selectedCategory && !loading && (
                  <div className="cm-header-actions flex flex-wrap items-center gap-3">
                    {adminToken && sessionValid() && (
                      <button
                        type="button"
                        className="cm-logout-button inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
                        onClick={handleLogout}
                      >
                        <LogOut size={15} className="text-zinc-400" />
                        Sign Out
                      </button>
                    )}

                    {manageMode && (
                      <>
                        <button
                          type="button"
                          className="collection-manage-button inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
                          onClick={() =>
                            openManagementView("dashboard")
                          }
                        >
                          <LayoutDashboard size={16} className="text-amber-400" />
                          Dashboard
                        </button>

                        <button
                          type="button"
                          className="collection-manage-button inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
                          onClick={() =>
                            openManagementView("hidden")
                          }
                        >
                          <EyeOff size={16} className="text-amber-400" />
                          Hidden Dresses
                        </button>

                        <button
                          type="button"
                          className="collection-manage-button inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
                          onClick={() =>
                            openManagementView("trash")
                          }
                        >
                          <Trash2 size={16} className="text-red-400" />
                          Trash Bin
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className={
                        "collection-manage-button inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm " +
                        (manageMode 
                          ? "bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold" 
                          : "bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700")
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
                          <Settings2 size={17} className="text-amber-400" />
                          Manage Collection
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {notice && (
                <div
                  className="cm-success-message bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 rounded-xl mb-6 flex items-center justify-between text-xs shadow-lg backdrop-blur-sm animate-fadeIn"
                  role="status"
                >
                  <div className="flex items-center gap-2.5">
                    <Check size={18} className="text-amber-400 shrink-0" />
                    <span className="font-medium">{notice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotice("")}
                    aria-label="Dismiss"
                    className="text-amber-400 hover:text-amber-200 transition-colors p-1"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {manageMode && (
                <div className="collection-management-bar bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                  <div className="collection-management-description flex items-center gap-3 text-xs text-zinc-300">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                      <CheckCheck size={18} />
                    </div>
                    <span className="font-semibold text-white">
                      Manage selected collection designs
                    </span>
                  </div>

                  <div className="collection-selection-actions flex items-center gap-4">
                    <span className="collection-selection-count text-xs text-zinc-400 font-medium">
                      {selectedIds.length} of {designs.length} selected
                    </span>
                    <button
                      type="button"
                      className="collection-text-action text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                      onClick={toggleSelectAll}
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                    {selectedIds.length > 0 && !allSelected && (
                      <button
                        type="button"
                        className="collection-text-action text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
                        onClick={() => setSelectedIds([])}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="custom-error bg-red-500/10 border border-red-500/20 text-red-300 p-6 rounded-2xl mb-8 flex flex-col sm:flex-row items-center justify-between gap-4" role="alert">
                  <p className="text-sm font-medium">{error}</p>
                  <button
                    type="button"
                    onClick={refreshGallery}
                    className="bg-red-500 hover:bg-red-400 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-xs transition-colors shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}

              {loading ? (
                <div className="loading flex flex-col items-center justify-center py-24 text-zinc-400 gap-4">
                  <LoaderCircle size={32} className="animate-spin text-amber-400" />
                  <span className="text-sm font-medium tracking-wide">Loading collection...</span>
                </div>
              ) : !selectedCategory ? (
                <div className="empty-state text-center py-24 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-sm">
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
          className="collection-floating-toolbar fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/80 shadow-2xl rounded-2xl px-6 py-3.5 flex items-center gap-6 text-xs text-zinc-200 transition-all animate-slideUp"
          role="toolbar"
          aria-label="Collection management"
        >
          <div className="collection-toolbar-count flex flex-col">
            <strong className="text-white font-bold">{selectedIds.length} selected</strong>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Manage designs</span>
          </div>

          <div className="collection-toolbar-divider w-px h-8 bg-zinc-800" />

          <div className="collection-toolbar-actions flex items-center gap-2">
            <button
              type="button"
              className="collection-toolbar-action flex items-center gap-1.5 bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 px-3.5 py-2 rounded-xl font-medium transition-all"
              disabled={selectedIds.length !== 1}
              onClick={openEditDialog}
              title="Select one dress to edit"
            >
              <Pencil size={15} className="text-amber-400" />
              Edit
            </button>

            <button
              type="button"
              className="collection-toolbar-action flex items-center gap-1.5 bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 px-3.5 py-2 rounded-xl font-medium transition-all"
              disabled={!selectedIds.length}
              onClick={() => openCollectionAction("move")}
            >
              <FolderInput size={15} className="text-amber-400" />
              Move
            </button>

            <button
              type="button"
              className="collection-toolbar-action flex items-center gap-1.5 bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 px-3.5 py-2 rounded-xl font-medium transition-all"
              disabled={!selectedIds.length}
              onClick={() => openCollectionAction("hide")}
            >
              <EyeOff size={15} className="text-amber-400" />
              Hide
            </button>

            <button
              type="button"
              className="collection-toolbar-action danger flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-2 rounded-xl font-medium transition-all border border-red-500/20"
              disabled={!selectedIds.length}
              onClick={openTrashDialog}
            >
              <Trash2 size={15} />
              Move to Trash
            </button>

            <button
              type="button"
              className="collection-toolbar-action danger flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-2 rounded-xl font-medium transition-all shadow-sm"
              disabled={!selectedIds.length}
              onClick={openPermanentDeleteDialog}
            >
              <Trash2 size={15} />
              Delete Permanently
            </button>
          </div>

          <button
            type="button"
            className="collection-toolbar-close text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 hover:bg-zinc-800 p-2 rounded-xl ml-2"
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