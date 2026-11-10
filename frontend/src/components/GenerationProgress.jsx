import React from "react";


export default function GenerationProgress({
  progress = 0,
  status = "Generating your look",
}) {
  const safeProgress =
    Math.min(
      100,
      Math.max(
        0,
        Number(progress) ||
          0
      )
    );


  const steps = [
    {
      label:
        "Preparing",
      value:
        10,
    },

    {
      label:
        "Front View",
      value:
        35,
    },

    {
      label:
        "Side Views",
      value:
        65,
    },

    {
      label:
        "Back View",
      value:
        85,
    },

    {
      label:
        "Complete",
      value:
        100,
    },
  ];


  return (
    <div className="generation-progress premium-generation-card">

      <div className="generation-orbit">

        <div className="generation-orbit-inner">
          AI
        </div>

      </div>


      <span className="generation-eyebrow">
        AI FASHION STUDIO
      </span>


      <h2>
        Creating Your Look
      </h2>


      <p className="generation-status">
        {status}
      </p>


      <div className="premium-progress-row">

        <span>
          Progress
        </span>

        <strong>
          {safeProgress}%
        </strong>

      </div>


      <div className="progress-track premium-progress-track">

        <div
          className="progress-bar"
          style={{
            width:
              `${safeProgress}%`,
          }}
        />

      </div>


      <div className="generation-step-list">

        {steps.map(
          (
            step,
            index
          ) => {

            const completed =
              safeProgress >=
              step.value;

            return (
              <div
                className={`generation-step ${
                  completed
                    ? "completed"
                    : ""
                }`}
                key={
                  step.label
                }
              >

                <div className="generation-step-indicator">
                  {completed
                    ? "✓"
                    : index + 1}
                </div>


                <span>
                  {step.label}
                </span>

              </div>
            );
          }
        )}

      </div>


      <div className="generation-hint">
        Please keep this page open while
        your four-view fashion preview is
        being generated.
      </div>

    </div>
  );
}