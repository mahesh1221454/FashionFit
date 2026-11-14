
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  EyeOff,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Shirt,
  Trash2,
} from "lucide-react";

import api, {
  getCategories,
  getDesigns,
  deleteEmptyCategory,
} from "../services/api";

import GeminiCostAnalyticsPanel from "./GeminiCostAnalyticsPanel";
import GenerationHistoryPanel from "./GenerationHistoryPanel";

const formatCount = (value) =>
  new Intl.NumberFormat("en-IN").format(
    Number(value) || 0,
  );

function readError(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  return error?.message || "Unable to load dashboard.";
}

function formatDate(value) {
  if (!value) return "Unknown date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MetricCard({
  label,
  value,
  Icon,
  tone,
  detail,
  unavailable = false,
}) {
  return (
    <div className={`cd-metric cd-${tone}`}>
      <div className="cd-metric-top">
        <span>{label}</span>
        <div className="cd-metric-icon">
          <Icon size={18} />
        </div>
      </div>

      <strong>
        {unavailable ? "—" : formatCount(value)}
      </strong>

      <small>
        {unavailable ? "Data unavailable" : detail}
      </small>
    </div>
  );
}

function extractList(response) {
  return Array.isArray(response?.data)
    ? response.data
    : null;
}

export default function CollectionDashboard({
  accessToken,
  onBack,
  onCategory,
  onCategoryDeleted,
  onNavigate,
  onSessionExpired,
}) {
  const [activeTab, setActiveTab] = useState(
    "overview",
  );

  const [categories, setCategories] = useState([]);
  const [categoryRows, setCategoryRows] = useState([]);

  // FF_CATEGORY_DELETE_V1
  const [deletingCategoryId, setDeletingCategoryId] =
    useState(null);

  const [hidden, setHidden] = useState([]);
  const [trash, setTrash] = useState([]);

  const [hiddenLoaded, setHiddenLoaded] =
    useState(false);
  const [trashLoaded, setTrashLoaded] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [errors, setErrors] = useState([]);
  const [search, setSearch] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  // -------------------------------------------------------
  // LOAD COLLECTION OVERVIEW
  // -------------------------------------------------------

  const loadDashboard = useCallback(
    async (quiet = false, signal) => {
      if (!accessToken) {
        setLoading(false);
        onSessionExpired?.();
        return;
      }

      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrors([]);

      try {
        const categoryData = await getCategories();

        if (signal?.aborted) return;

        if (!Array.isArray(categoryData)) {
          throw new Error(
            "Invalid categories response.",
          );
        }

        const requests = [
          ...categoryData.map((category) =>
            getDesigns(category.id),
          ),

          api.get(
            "/designs/management/hidden",
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
              signal,
            },
          ),

          api.get(
            "/designs/management/trash",
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
              signal,
            },
          ),
        ];

        const results = await Promise.allSettled(
          requests,
        );

        if (signal?.aborted) return;

        const hiddenResult =
          results[categoryData.length];

        const trashResult =
          results[categoryData.length + 1];

        const authFailed = [
          hiddenResult,
          trashResult,
        ].some(
          (result) =>
            result.status === "rejected" &&
            [401, 403].includes(
              result.reason?.response?.status,
            ),
        );

        if (authFailed) {
          onSessionExpired?.();
          return;
        }

        const nextErrors = [];

        const rows = categoryData.map(
          (category, index) => {
            const result = results[index];

            if (
              result.status === "fulfilled" &&
              Array.isArray(result.value)
            ) {
              return {
                ...category,
                count: result.value.length,
                loaded: true,
              };
            }

            nextErrors.push(
              `Could not load ${category.name}.`,
            );

            return {
              ...category,
              count: 0,
              loaded: false,
            };
          },
        );

        let nextHidden = [];
        let nextTrash = [];

        let nextHiddenLoaded = false;
        let nextTrashLoaded = false;

        if (
          hiddenResult.status === "fulfilled" &&
          extractList(hiddenResult.value)
        ) {
          nextHidden = extractList(hiddenResult.value);
          nextHiddenLoaded = true;
        } else {
          nextErrors.push(
            "Could not load Hidden Dresses.",
          );
        }

        if (
          trashResult.status === "fulfilled" &&
          extractList(trashResult.value)
        ) {
          nextTrash = extractList(trashResult.value);
          nextTrashLoaded = true;
        } else {
          nextErrors.push(
            "Could not load Trash Bin.",
          );
        }

        setCategories(categoryData);
        setCategoryRows(rows);
        setHidden(nextHidden);
        setTrash(nextTrash);

        setHiddenLoaded(nextHiddenLoaded);
        setTrashLoaded(nextTrashLoaded);

        setErrors(nextErrors);
        setUpdatedAt(new Date());
      } catch (error) {
        if (signal?.aborted) return;

        if (
          [401, 403].includes(
            error.response?.status,
          )
        ) {
          onSessionExpired?.();
          return;
        }

        setErrors([readError(error)]);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, onSessionExpired],
  );

  useEffect(() => {
    if (activeTab !== "overview") {
      return;
    }

    const controller = new AbortController();

    loadDashboard(false, controller.signal);

    return () => {
      controller.abort();
    };
  }, [activeTab, loadDashboard]);

  // -------------------------------------------------------
  // OVERVIEW STATISTICS
  // -------------------------------------------------------

  const activeTotal = categoryRows.reduce(
    (total, category) =>
      total +
      (category.loaded ? category.count : 0),
    0,
  );

  const categoriesComplete =
    categoryRows.length === categories.length &&
    categoryRows.every(
      (category) => category.loaded,
    );

  const incomplete =
    errors.length > 0 ||
    !categoriesComplete ||
    !hiddenLoaded ||
    !trashLoaded;

  const sortedCategories = useMemo(
    () =>
      [...categoryRows].sort((a, b) => {
        if (a.loaded !== b.loaded) {
          return a.loaded ? -1 : 1;
        }

        return b.count - a.count;
      }),
    [categoryRows],
  );

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortedCategories.filter((category) =>
      category.name.toLowerCase().includes(term),
    );
  }, [search, sortedCategories]);

  const maxCount = Math.max(
    1,
    ...categoryRows
      .filter((category) => category.loaded)
      .map((category) => category.count),
  );

  const recentTrash = useMemo(
    () =>
      [...trash]
        .sort(
          (a, b) =>
            new Date(b.trashed_at).getTime() -
            new Date(a.trashed_at).getTime(),
        )
        .slice(0, 5),
    [trash],
  );

  // -------------------------------------------------------
  // ADMIN NAVIGATION
  // -------------------------------------------------------

  function openProtectedView(view) {
    if (!accessToken) {
      onSessionExpired?.();
      return;
    }

    onNavigate?.(view);
  }

  function openCategory(category) {
    if (!accessToken) {
      onSessionExpired?.();
      return;
    }

    onCategory?.(category);
  }


  // FF_CATEGORY_DELETE_V1
  async function handleDeleteCategory(category) {
    if (!category?.id || deletingCategoryId) return;

    if (!accessToken) {
      onSessionExpired?.();
      return;
    }

    const enteredName = window.prompt(
      `Delete category "${category.name}"?\\n\\n` +
      "Only empty categories can be deleted. " +
      "Hidden and trashed dresses also count.\\n\\n" +
      "Type the exact category name to confirm:"
    );

    if (enteredName !== category.name) {
      return;
    }

    setDeletingCategoryId(category.id);

    try {
      const result = await deleteEmptyCategory({
        categoryId: category.id,
        accessToken,
      });

      if (result?.success !== true ||
          result?.deleted !== true) {
        throw new Error(
          "The backend did not confirm category deletion."
        );
      }

      try {
        await onCategoryDeleted?.(category.id);
      } catch (refreshError) {
        console.error(
          "Category deleted, but sidebar refresh failed:",
          refreshError
        );
      }

      await loadDashboard(true);

    } catch (error) {
      if (error.response?.status === 401) {
        onSessionExpired?.();
        return;
      }

      window.alert(readError(error));

    } finally {
      setDeletingCategoryId(null);
    }
  }

  return (
    <section className="cd-root">
      {/* Back navigation */}

      <div className="cd-breadcrumb">
        <button
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          Back to Collection
        </button>

        <span className="cd-admin-indicator">
          <ShieldCheck size={15} />
          Administrator Dashboard
        </span>
      </div>

      {/* Main heading */}

      <div className="cd-header">
        <div>
          <span className="cd-eyebrow">
            FASHION AI ADMINISTRATION
          </span>

          <h1>Management Dashboard</h1>

          <p>
            Manage your clothing catalog and monitor
            AI API activity in one place.
          </p>
        </div>
      </div>

      {/* New dashboard tabs */}

      <div
        className="cd-tabs"
        role="tablist"
        aria-label="Management dashboard sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className={
            activeTab === "overview"
              ? "cd-tab active"
              : "cd-tab"
          }
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard size={17} />
          Collection Overview
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "gemini"}
          className={
            activeTab === "gemini"
              ? "cd-tab active"
              : "cd-tab"
          }
          onClick={() => setActiveTab("gemini")}
        >
          <Activity size={17} />
          AI API Usage & Cost
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={
            activeTab === "history"
              ? "cd-tab active"
              : "cd-tab"
          }
          onClick={() => setActiveTab("history")}
        >
          Generation History
        </button>
      </div>

      {/* Gemini monitoring */}

      {activeTab === "history" ? (
        <GenerationHistoryPanel
          accessToken={accessToken}
          onSessionExpired={onSessionExpired}
        />
      ) : activeTab === "gemini" ? (
        <GeminiCostAnalyticsPanel
          accessToken={accessToken}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <div className="cd-overview-top">
            <div>
              <h2>Collection Overview</h2>
              <p>
                Live statistics from your PostgreSQL
                clothing catalog.
              </p>
            </div>

            <button
              type="button"
              className="cd-refresh"
              disabled={loading || refreshing}
              onClick={() => loadDashboard(true)}
            >
              <RefreshCw
                size={16}
                className={
                  refreshing ? "cd-spin" : ""
                }
              />
              Refresh Data
            </button>
          </div>

          {errors.length > 0 && (
            <div
              className="cd-warning"
              role="alert"
            >
              <CircleAlert size={19} />

              <div>
                <strong>
                  Some dashboard data could not be loaded.
                </strong>

                <span>
                  {errors.join(" ")} Counts for
                  unavailable sections are incomplete.
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="cd-loading">
              <LoaderCircle
                size={27}
                className="cd-spin"
              />

              <strong>
                Loading collection statistics...
              </strong>

              <span>
                Reading your catalog from FastAPI.
              </span>
            </div>
          ) : (
            <>
              {/* Overview metric cards */}

              <div className="cd-metrics">
                <MetricCard
                  label="Active Designs"
                  value={activeTotal}
                  Icon={Shirt}
                  tone="orange"
                  detail={
                    incomplete
                      ? "Available records only"
                      : "Visible in the gallery"
                  }
                  unavailable={!categoriesComplete}
                />

                <MetricCard
                  label="Categories"
                  value={categories.length}
                  Icon={FolderOpen}
                  tone="blue"
                  detail="Clothing categories"
                />

                <MetricCard
                  label="Hidden Dresses"
                  value={hidden.length}
                  Icon={EyeOff}
                  tone="purple"
                  detail="Excluded from the gallery"
                  unavailable={!hiddenLoaded}
                />

                <MetricCard
                  label="In Trash"
                  value={trash.length}
                  Icon={Trash2}
                  tone="red"
                  detail="Available for restoration"
                  unavailable={!trashLoaded}
                />
              </div>

              <div className="cd-main-grid">
                {/* Category distribution */}

                <section className="cd-panel">
                  <div className="cd-panel-heading">
                    <div>
                      <span className="cd-eyebrow">
                        CATALOG BREAKDOWN
                      </span>

                      <h2>Category Distribution</h2>

                      <p>
                        Active dresses in each category.
                      </p>
                    </div>

                    <div className="cd-search">
                      <Search size={15} />

                      <input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search categories"
                        aria-label="Search categories"
                      />
                    </div>
                  </div>

                  {visibleCategories.length ? (
                    <div className="cd-category-list">
                      {visibleCategories.map(
                        (category) => (
                          <div
                            key={category.id}
                            className="cd-category-entry"
                          >
                            <button
                              type="button"
                              className="cd-category-row"
                              onClick={() =>
                                openCategory(category)
                              }
                            >
                            <div className="cd-category-circle">
                              <FolderOpen size={17} />
                            </div>

                            <div className="cd-category-content">
                              <div className="cd-category-label">
                                <strong>
                                  {category.name}
                                </strong>

                                <span>
                                  {category.loaded
                                    ? `${formatCount(category.count)} dresses`
                                    : "Unavailable"}
                                </span>
                              </div>

                              <div className="cd-bar-track">
                                <div
                                  className="cd-bar-fill"
                                  style={{
                                    width:
                                      category.loaded
                                        ? `${(category.count / maxCount) * 100}%`
                                        : "0%",
                                  }}
                                />
                              </div>
                            </div>

                              <ChevronRight size={16} />
                            </button>

                            <button
                              type="button"
                              className="cd-category-delete"
                              disabled={Boolean(deletingCategoryId)}
                              onClick={() =>
                                handleDeleteCategory(category)
                              }
                              title="Delete category if empty"
                              aria-label={`Delete category ${category.name}`}
                            >
                              {deletingCategoryId === category.id ? (
                                <LoaderCircle
                                  size={16}
                                  className="cd-spin"
                                />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="cd-empty">
                      No matching categories.
                    </div>
                  )}
                </section>

                {/* Quick actions */}

                <div className="cd-side-column">
                  <section className="cd-panel">
                    <div className="cd-panel-heading">
                      <div>
                        <span className="cd-eyebrow">
                          ADMINISTRATOR TOOLS
                        </span>
                        <h2>Quick Actions</h2>
                        <p>
                          Manage the catalog securely.
                        </p>
                      </div>
                    </div>

                    <div className="cd-quick-actions">
                      <button
                        type="button"
                        onClick={onBack}
                      >
                        <span className="cd-quick-icon cd-quick-orange">
                          <Shirt size={18} />
                        </span>

                        <span>
                          <strong>
                            Manage Collection
                          </strong>
                          <small>
                            Edit, move, hide and trash
                          </small>
                        </span>

                        <ArrowRight size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openProtectedView(
                            "hidden",
                          )
                        }
                      >
                        <span className="cd-quick-icon cd-quick-purple">
                          <EyeOff size={18} />
                        </span>

                        <span>
                          <strong>
                            Hidden Dresses
                          </strong>
                          <small>
                            Review and unhide designs
                          </small>
                        </span>

                        <ArrowRight size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openProtectedView(
                            "trash",
                          )
                        }
                      >
                        <span className="cd-quick-icon cd-quick-red">
                          <Trash2 size={18} />
                        </span>

                        <span>
                          <strong>Trash Bin</strong>
                          <small>
                            Restore removed designs
                          </small>
                        </span>

                        <ArrowRight size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveTab("gemini")
                        }
                      >
                        <span className="cd-quick-icon cd-quick-blue">
                          <Activity size={18} />
                        </span>

                        <span>
                          <strong>
                            AI API Usage & Cost
                          </strong>
                          <small>
                            Monitor requests and tokens
                          </small>
                        </span>

                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>

                  {/* Data status */}

                  <section className="cd-panel">
                    <div className="cd-panel-heading">
                      <div>
                        <span className="cd-eyebrow">
                          DATA STATUS
                        </span>
                        <h2>Catalog Snapshot</h2>
                      </div>

                      {incomplete ? (
                        <CircleAlert
                          size={19}
                          className="cd-status-warning"
                        />
                      ) : (
                        <CheckCircle2
                          size={19}
                          className="cd-status-ok"
                        />
                      )}
                    </div>

                    <div className="cd-status-line">
                      <Activity size={16} />

                      <span>
                        {incomplete
                          ? "Partial data loaded"
                          : "All dashboard requests completed"}
                      </span>
                    </div>

                    {updatedAt && (
                      <p className="cd-last-updated">
                        Last refreshed at{" "}
                        {updatedAt.toLocaleTimeString(
                          "en-IN",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </p>
                    )}
                  </section>
                </div>
              </div>

              {/* Recent Trash activity */}

              <section className="cd-panel">
                <div className="cd-panel-heading">
                  <div>
                    <span className="cd-eyebrow">
                      RECENT ACTIVITY
                    </span>

                    <h2>
                      Recently Trashed Dresses
                    </h2>

                    <p>
                      Based on actual Trash timestamps
                      stored in PostgreSQL.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="cd-text-button"
                    onClick={() =>
                      openProtectedView(
                        "trash",
                      )
                    }
                  >
                    View Trash
                    <ArrowRight size={15} />
                  </button>
                </div>

                {!trashLoaded ? (
                  <div className="cd-empty">
                    Trash data is unavailable.
                  </div>
                ) : recentTrash.length ? (
                  <div className="cd-recent-list">
                    {recentTrash.map(
                      (dress) => (
                        <div
                          key={dress.id}
                          className="cd-recent-item"
                        >
                          <div className="cd-recent-image">
                            {dress.image_url ? (
                              <img
                                src={dress.image_url}
                                alt=""
                              />
                            ) : (
                              <Shirt size={19} />
                            )}
                          </div>

                          <div className="cd-recent-info">
                            <strong>
                              {dress.name}
                            </strong>

                            <span>
                              {dress.category_name}
                              {" · "}
                              {dress.design_code}
                            </span>
                          </div>

                          <time>
                            {formatDate(
                              dress.trashed_at,
                            )}
                          </time>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="cd-empty">
                    No recently trashed dresses.
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      <style>{DASHBOARD_STYLES}</style>
    </section>
  );
}

const DASHBOARD_STYLES = `
.cd-root {
  width: 100%;
  padding-bottom: 55px;
  color: #18181b;
  font-family: inherit;
}

.cd-root * {
  box-sizing: border-box;
}

.cd-breadcrumb,
.cd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.cd-breadcrumb {
  margin-bottom: 22px;
}

.cd-breadcrumb button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #52525b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.cd-breadcrumb button:hover {
  color: #ea580c;
}

.cd-admin-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: 1px solid #bbf7d0;
  border-radius: 99px;
  background: #f0fdf4;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
}

.cd-eyebrow {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.cd-header {
  margin-bottom: 20px;
}

.cd-header h1 {
  margin: 7px 0 8px;
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: -.7px;
}

.cd-header p,
.cd-overview-top p,
.cd-panel-heading p {
  margin: 0;
  color: #8b8b94;
  font-size: 12px;
  line-height: 1.6;
}

/* Management tabs */

.cd-tabs {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  padding: 6px;
  margin-bottom: 22px;
  border: 1px solid #eaeaec;
  border-radius: 13px;
  background: #fff;
}

.cd-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 12px 16px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #71717a;
  font-family: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: .15s ease;
}

.cd-tab:hover {
  background: #fafafa;
  color: #27272a;
}

.cd-tab.active {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #ea580c;
}

.cd-overview-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 19px;
}

.cd-overview-top h2 {
  margin: 0 0 7px;
  font-size: 21px;
  font-weight: 800;
}

.cd-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 39px;
  padding: 10px 14px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fff;
  color: #3f3f46;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.cd-refresh:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* Overview cards */

.cd-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.cd-metric {
  min-width: 0;
  padding: 17px;
  border: 1px solid #eaeaec;
  border-radius: 15px;
  background: #fff;
}

.cd-metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 18px;
}

.cd-metric-top > span {
  color: #71717a;
  font-size: 11px;
  font-weight: 700;
}

.cd-metric-icon {
  display: grid;
  place-items: center;
  width: 37px;
  height: 37px;
  border-radius: 10px;
}

.cd-orange .cd-metric-icon {
  background: #fff7ed;
  color: #ea580c;
}

.cd-blue .cd-metric-icon {
  background: #eff6ff;
  color: #2563eb;
}

.cd-purple .cd-metric-icon {
  background: #faf5ff;
  color: #9333ea;
}

.cd-red .cd-metric-icon {
  background: #fef2f2;
  color: #dc2626;
}

.cd-metric > strong {
  display: block;
  margin-bottom: 8px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -1px;
}

.cd-metric > small {
  color: #a1a1aa;
  font-size: 10px;
  line-height: 1.5;
}

/* Main panels */

.cd-main-grid {
  display: grid;
  grid-template-columns:
    minmax(0, 1.6fr)
    minmax(260px, 1fr);
  align-items: start;
  gap: 18px;
  margin-bottom: 20px;
}

.cd-side-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.cd-panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid #eaeaec;
  border-radius: 16px;
  background: #fff;
}

.cd-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
}

.cd-panel-heading h2 {
  margin: 5px 0;
  font-size: 17px;
  font-weight: 800;
}

.cd-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 200px);
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  color: #a1a1aa;
  background: #fafafa;
}

.cd-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #27272a;
  font-family: inherit;
  font-size: 11px;
}

.cd-category-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cd-category-row {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 11px 9px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: #fff;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.cd-category-row:hover {
  border-color: #fed7aa;
  background: #fffaf5;
}

.cd-category-circle {
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  height: 39px;
  border-radius: 10px;
  background: #fff7ed;
  color: #ea580c;
}

.cd-category-content {
  flex: 1;
  min-width: 0;
}

.cd-category-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.cd-category-label strong {
  overflow: hidden;
  color: #27272a;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-category-label span {
  flex-shrink: 0;
  color: #71717a;
  font-size: 10px;
}

.cd-bar-track {
  height: 6px;
  overflow: hidden;
  border-radius: 9px;
  background: #f4f4f5;
}

.cd-bar-fill {
  height: 100%;
  border-radius: 9px;
  background: #f97316;
  transition: width .2s ease;
}

.cd-category-row > svg {
  flex-shrink: 0;
  color: #a1a1aa;
}

/* Quick actions */

.cd-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.cd-quick-actions button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.cd-quick-actions button:hover {
  border-color: #e4e4e7;
  background: #fafafa;
}

.cd-quick-icon {
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  height: 39px;
  border-radius: 10px;
}

.cd-quick-orange {
  background: #fff7ed;
  color: #ea580c;
}

.cd-quick-purple {
  background: #faf5ff;
  color: #9333ea;
}

.cd-quick-red {
  background: #fef2f2;
  color: #dc2626;
}

.cd-quick-blue {
  background: #eff6ff;
  color: #2563eb;
}

.cd-quick-actions button > span:nth-child(2) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cd-quick-actions strong {
  color: #27272a;
  font-size: 12px;
}

.cd-quick-actions small {
  color: #a1a1aa;
  font-size: 10px;
}

.cd-quick-actions button > svg {
  color: #a1a1aa;
}

/* Data status */

.cd-status-ok {
  color: #16a34a;
}

.cd-status-warning {
  color: #d97706;
}

.cd-status-line {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #52525b;
  font-size: 12px;
}

.cd-status-line svg {
  color: #16a34a;
}

.cd-last-updated {
  margin: 11px 0 0;
  color: #a1a1aa;
  font-size: 11px;
}

/* Recent trash */

.cd-recent-list {
  display: flex;
  flex-direction: column;
}

.cd-recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid #f4f4f5;
}

.cd-recent-image {
  display: grid;
  place-items: center;
  flex: 0 0 43px;
  height: 48px;
  overflow: hidden;
  border-radius: 8px;
  background: #f4f4f5;
  color: #a1a1aa;
}

.cd-recent-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cd-recent-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cd-recent-info strong,
.cd-recent-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-recent-info strong {
  color: #27272a;
  font-size: 12px;
}

.cd-recent-info span {
  color: #a1a1aa;
  font-size: 10px;
}

.cd-recent-item time {
  flex-shrink: 0;
  color: #71717a;
  font-size: 10px;
}

.cd-text-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  background: transparent;
  color: #ea580c;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

/* Feedback */

.cd-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px;
  margin-bottom: 16px;
  border: 1px solid #fed7aa;
  border-radius: 11px;
  background: #fffbeb;
  color: #92400e;
}

.cd-warning > svg {
  flex-shrink: 0;
}

.cd-warning > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cd-warning strong {
  font-size: 12px;
}

.cd-warning span {
  font-size: 11px;
  line-height: 1.5;
}

.cd-loading,
.cd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 160px;
  padding: 15px;
  color: #a1a1aa;
  text-align: center;
  font-size: 12px;
}

.cd-loading strong {
  color: #3f3f46;
  font-size: 14px;
}

.cd-spin {
  animation: cd-spin .8s linear infinite;
}

@keyframes cd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .cd-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cd-main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .cd-panel {
    padding: 14px;
  }

  .cd-metrics {
    gap: 10px;
  }

  .cd-metric {
    padding: 13px;
  }

  .cd-metric > strong {
    font-size: 25px;
  }

  .cd-metric-top {
    margin-bottom: 12px;
  }

  .cd-recent-item time {
    display: none;
  }

  .cd-search {
    width: 100%;
  }

  .cd-tab {
    flex: 1;
    padding: 11px 9px;
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-spin {
    animation: none;
  }

  .cd-bar-fill {
    transition: none;
  }
}

/* FF_CATEGORY_DELETE_V1 */

.cd-category-entry {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
}

.cd-category-entry > .cd-category-row {
  flex: 1;
  min-width: 0;
}

.cd-category-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  flex: 0 0 38px;
  width: 38px;
  height: 38px;

  border: 1px solid #fee2e2;
  border-radius: 10px;

  background: #fff5f5;
  color: #dc2626;

  cursor: pointer;

  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.cd-category-delete:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
  transform: translateY(-1px);
}

.cd-category-delete:focus-visible {
  outline: 2px solid #f97316;
  outline-offset: 2px;
}

.cd-category-delete:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .cd-category-entry {
    gap: 6px;
  }

  .cd-category-delete {
    flex-basis: 35px;
    width: 35px;
    height: 35px;
  }
}
`;
