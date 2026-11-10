import DesignCard
  from "./DesignCard";


export default function DesignGrid({
  designs,
  onDesignClick,
}) {

  if (!designs.length) {

    return (
      <div className="empty-state">
        No designs found in this category.
      </div>
    );
  }

  return (

    <div className="design-grid">

      {designs.map(
        (design) => (

          <DesignCard
            key={design.id}
            design={design}
            onClick={() =>
              onDesignClick(
                design
              )
            }
          />

        )
      )}

    </div>
  );
}