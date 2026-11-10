import React from "react";


export default function ResultCard({
  title,
  image,
}) {
  return (
    <div className="result-card">

      <div className="result-image-wrapper">

        {image ? (

          <img
            src={image}
            alt={title}
          />

        ) : (

          <div className="image-placeholder">
            Image unavailable
          </div>

        )}

      </div>


      <div className="result-card-footer">

        <h3>
          {title}
        </h3>


        <span className="result-card-view">
          View
        </span>

      </div>

    </div>
  );
}