
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Shirt,
  ArrowUpRight,
} from "lucide-react";

import "../styles/customDress.css";

export default function Sidebar({
  categories = [],
  selectedCategory,
  onSelect,
}) {
  const navigate = useNavigate();

  const handleCategorySelect = (category) => {
    if (typeof onSelect === "function") {
      onSelect(category);
    }
  };

  const handleCustomUpload = () => {
    navigate("/custom-dress");
  };

  const isCustomPage =
    window.location.pathname === "/custom-dress";

  return (
    <aside className="sidebar">
      {/* BRAND SECTION */}
      <div className="brand">
        <div className="sidebar-brand-top">
          <div className="sidebar-brand-icon">
            <img src="/perfectmess-monogram.png" alt="PerfectMess Logo" className="sidebar-company-logo" />
          </div>

          <div className="sidebar-brand-text">
            <h2>PerfectMess</h2>
            <p>Personal Styling Studio</p>
          </div>
        </div>
      </div>

      {/* CATEGORY SECTION */}
      <div className="sidebar-category-section">
        <div className="sidebar-section-header">
          <span className="category-heading">
            Categories
          </span>
        </div>

        <nav
          className="category-list"
          aria-label="Dress categories"
        >
          {categories.map((category) => {
            const isActive =
              selectedCategory?.id === category.id;

            return (
              <button
                key={category.id}
                type="button"
                className={
                  `category-button ${
                    isActive ? "active" : ""
                  }`
                }
                onClick={() =>
                  handleCategorySelect(category)
                }
                aria-current={
                  isActive ? "page" : undefined
                }
              >
                <span className="category-button-text">
                  {category.name}
                </span>

                {isActive && (
                  <ArrowUpRight
                    size={16}
                    className="category-active-icon"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* CUSTOM DRESS - BOTTOM SECTION */}
      <div className="custom-sidebar-section">
        <div className="custom-sidebar-header">
          <span className="category-heading custom-heading">
            Your Design
          </span>
        </div>

        <button
          type="button"
          className={
            `custom-upload-button ${
              isCustomPage ? "is-active" : ""
            }`
          }
          onClick={handleCustomUpload}
        >
          <Upload
            size={18}
            strokeWidth={2}
          />

          <span>Upload Custom Dress</span>

          <ArrowUpRight
            size={15}
            className="custom-button-arrow"
          />
        </button>

        <p className="custom-sidebar-note">
          Have your own outfit? Upload it and
          experience your personalized AI try-on.
        </p>
      </div>
    </aside>
  );
}

