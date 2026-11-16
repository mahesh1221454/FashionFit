import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getGeneration,
} from "../services/api";

import GenerationProgress from "../components/GenerationProgress";

const VIEWS = ["front", "left", "right", "back"];

export default function GeneratePage() {
  const { jobId } = useParams();

  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");

  const allImagesReady = VIEWS.every(
    (view) => Boolean(job?.[`output_${view}_url`])
  );

  const completed =
    job?.status === "completed" && allImagesReady;

  useEffect(() => {
    setJob(null);
    setLoading(true);
    setError("");
    setConnectionError("");

    if (!jobId) {
      setError("Generation job ID is missing.");
      setLoading(false);
      return;
    }

    let mounted = true;
    let timer = null;

    const checkGeneration = async () => {
      try {
        const data = await getGeneration(jobId);

        if (!mounted) return;

        setJob(data);
        setLoading(false);
        setConnectionError("");

        if (data.status === "completed") {
          const ready = VIEWS.every(
            (view) => Boolean(data[`output_${view}_url`])
          );

          if (!ready) {
            setError("Some generated images are unavailable.");
          }

          // Stop polling. Stay on this page.
          return;
        }

        if (data.status === "failed") {
          setError(
            data.error_message || "Generation failed."
          );

          return;
        }
      } catch (err) {
        if (!mounted) return;

        console.error("Generation polling failed:", err);

        setLoading(false);

        setConnectionError(
          "Connection interrupted. Reconnecting..."
        );

        if ([401, 403, 404, 410].includes(
          err?.response?.status
        )) {
          setConnectionError("");
          setError(
            "This generation session is no longer accessible."
          );
          return;
        }
      }

      if (mounted) {
        timer = setTimeout(checkGeneration, 2000);
      }
    };

    checkGeneration();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  const progress = Number(job?.progress || 0);

  return (
    <div className="generation-page">
      <style>{`
        .ff-generation-next-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-top: 22px;
          margin-bottom: 80px;
          padding: 22px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #ffffff;
        }

        .ff-generation-next-section h3 {
          color: #17263c;
          font-size: 17px;
          margin: 0 0 6px;
        }

        .ff-generation-next-section p {
          color: #64748b;
          font-size: 13px;
          margin: 0;
        }

        .ff-generation-next-button {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 14px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 14px 25px;
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          transition: background .2s, box-shadow .2s;
        }

        .ff-generation-next-button:hover {
          background: #ea580c;
          box-shadow: 0 5px 16px #f9731633;
        }

        .ff-generation-error {
          margin-top: 18px;
          padding: 20px;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 12px;
        }

        @media (max-width: 600px) {
          .ff-generation-next-section {
            flex-direction: column;
            align-items: stretch;
          }

          .ff-generation-next-button {
            width: 100%;
          }
        }
      `}</style>

      <div className="generation-background-glow generation-glow-one" />
      <div className="generation-background-glow generation-glow-two" />

      <div className="generation-page-inner">
        <GenerationProgress
          job={job}
          progress={loading ? 0 : progress}
          status={
            completed
              ? "Your fashion preview is ready"
              : "Generating your fashion preview"
          }
        />

        {connectionError && (
          <p
            role="status"
            style={{
              color: "#b45309",
              textAlign: "center",
              padding: 12,
            }}
          >
            {connectionError}
          </p>
        )}

        {error && (
          <div className="ff-generation-error">
            <h3>Unable to complete generation</h3>

            <p>{error}</p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate("/portal")}
            >
              Choose Another Design
            </button>
          </div>
        )}

        {completed && !error && (
          <div className="ff-generation-next-section">
            <div>
              <h3>Ready for the next step?</h3>

              <p>
                Review your four generated images
                and continue to body measurements.
              </p>
            </div>

            <button
              className="ff-generation-next-button"
              type="button"
              onClick={() =>
                navigate(`/results/${jobId}`)
              }
            >
              Next
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}