
import { Check, Eye } from "lucide-react";

export default function DesignCard({
  design,
  onClick,
  manageMode = false,
  selected = false,
  onSelect,
}) {
  const handleClick = () => {
    if (manageMode) {
      onSelect?.(design);
      return;
    }

    onClick?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <article
      className={[
        "design-card",
        "collection-design-card",
        manageMode ? "collection-manage-card" : "",
        selected ? "collection-selected-card" : "",
      ].filter(Boolean).join(" ")}
    >
      <div
        className="collection-card-clickable"
        role={manageMode ? "checkbox" : "button"}
        aria-checked={manageMode ? selected : undefined}
        aria-label={
          manageMode
            ? `${selected ? "Deselect" : "Select"} ${design.name}`
            : `View ${design.name}`
        }
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="design-image-wrapper">
          <img
            src={design.image_url}
            alt={design.name}
            className="design-image"
            loading="lazy"
          />

          {manageMode && (
            <>
              <div
                className={
                  "collection-selection-check" +
                  (selected ? " is-checked" : "")
                }
                aria-hidden="true"
              >
                {selected && <Check size={15} strokeWidth={3} />}
              </div>

              {selected && (
                <div className="collection-selected-overlay" />
              )}
            </>
          )}

          {!manageMode && (
            <div className="collection-view-hint">
              <Eye size={16} />
              <span>View Design</span>
            </div>
          )}
        </div>

        <div className="design-info">
          <span className="design-code">
            {design.design_code}
          </span>

          <h3>{design.name}</h3>
        </div>
      </div>
    </article>
  );
}
