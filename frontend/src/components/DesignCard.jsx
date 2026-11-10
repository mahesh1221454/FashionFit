export default function DesignCard({
  design,
  onClick,
}) {

  return (

    <div
      className="design-card"
      onClick={onClick}
    >

      <div className="design-image-wrapper">

        <img
          src={design.image_url}
          alt={design.name}
          className="design-image"
        />

      </div>

      <div className="design-info">

        <span className="design-code">
          {design.design_code}
        </span>

        <h3>
          {design.name}
        </h3>

      </div>

    </div>
  );
}