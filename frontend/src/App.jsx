
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

// Existing Pages
import HomePage from "./pages/HomePage";
import DesignDetailsPage from "./pages/DesignDetailsPage";
import GeneratePage from "./pages/GeneratePage";
import ResultsPage from "./pages/ResultsPage";

// New Custom Dress Upload Page
import CustomDressPage from "./pages/CustomDressPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home Page - Clothing Categories */}
        <Route
          path="/"
          element={<HomePage />}
        />

        {/* New Custom Dress Upload Page */}
        <Route
          path="/custom-dress"
          element={<CustomDressPage />}
        />

        {/* Existing Design Details Page */}
        <Route
          path="/design/:designId"
          element={<DesignDetailsPage />}
        />

        {/* Existing AI Generation Page */}
        <Route
          path="/generate/:jobId"
          element={<GeneratePage />}
        />

        {/* Existing AI Results Page */}
        <Route
          path="/results/:jobId"
          element={<ResultsPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}
