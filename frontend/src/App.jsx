
import { useEffect, useState } from "react";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

import { Clock3, LogOut } from "lucide-react";

import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import DesignDetailsPage from "./pages/DesignDetailsPage";
import GeneratePage from "./pages/GeneratePage";
import ResultsPage from "./pages/ResultsPage";
import CustomDressPage from "./pages/CustomDressPage";

import {
  getPortalSession,
  clearPortalSession,
} from "./services/portalSession";

// =====================================
// ROUTE PROTECTION
// =====================================

function RequireLogin({ children }) {
  const navigate = useNavigate();

  const [loggedIn, setLoggedIn] = useState(
    Boolean(getPortalSession())
  );

  useEffect(() => {
    const refreshLogin = () => {
      setLoggedIn(Boolean(getPortalSession()));
    };

    const interval = setInterval(
      refreshLogin,
      10000
    );

    window.addEventListener(
      "focus",
      refreshLogin
    );

    return () => {
      clearInterval(interval);

      window.removeEventListener(
        "focus",
        refreshLogin
      );
    };
  }, []);

  const handleLogout = () => {
    clearPortalSession();

    setLoggedIn(false);

    navigate("/", {
      replace: true,
    });
  };

  if (!loggedIn) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return (
    <>
      {children}

      <button
        type="button"
        onClick={handleLogout}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 18px",
          borderRadius: 30,
          border: "1px solid #b08b61",
          background: "#181717",
          color: "#fff",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 4px 20px #0005",
        }}
      >
        <LogOut size={16} />
        Logout
      </button>
    </>
  );
}

// =====================================
// EXISTING RESULTS BEHAVIOR
// =====================================

function ResultsRoute() {
  const { jobId } = useParams();

  const isTemporary = jobId?.startsWith(
    "temp_"
  );

  return (
    <>
      {isTemporary && (
        <div className="tryon-page">
          <div className="tryon-temporary-notice">
            <Clock3 size={21} />

            <div>
              <strong>
                Temporary AI Try-On Results
              </strong>

              <p>
                This dress has not been added to the
                portal catalog. Download your results
                before the session expires.
              </p>
            </div>
          </div>
        </div>
      )}

      <ResultsPage />
    </>
  );
}

// =====================================
// MAIN APPLICATION ROUTES
// =====================================

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public animated home page */}
        <Route
          path="/"
          element={<LandingPage />}
        />

        {/* Existing Fashion AI Portal */}
        <Route
          path="/portal"
          element={
            <RequireLogin>
              <HomePage />
            </RequireLogin>
          }
        />

        {/* Existing custom dress page */}
        <Route
          path="/custom-dress"
          element={
            <RequireLogin>
              <CustomDressPage />
            </RequireLogin>
          }
        />

        {/* Existing dress details */}
        <Route
          path="/design/:designId"
          element={
            <RequireLogin>
              <DesignDetailsPage />
            </RequireLogin>
          }
        />

        {/* Existing AI generation */}
        <Route
          path="/generate/:jobId"
          element={
            <RequireLogin>
              <GeneratePage />
            </RequireLogin>
          }
        />

        {/* Existing generated results */}
        <Route
          path="/results/:jobId"
          element={
            <RequireLogin>
              <ResultsRoute />
            </RequireLogin>
          }
        />

        {/* Unknown routes */}
        <Route
          path="*"
          element={
            <Navigate to="/" replace />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}
