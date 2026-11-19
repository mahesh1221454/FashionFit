import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import ImageUploader from "../components/ImageUploader";

import {
  getDesign,
  createGeneration,
} from "../services/api";


export default function DesignDetailsPage() {
  const {
    designId,
  } = useParams();


  const navigate =
    useNavigate();


  // =========================================================
  // DESIGN STATE
  // =========================================================

  const [
    design,
    setDesign,
  ] = useState(null);


  const [
    loadingDesign,
    setLoadingDesign,
  ] = useState(true);


  // =========================================================
  // GENERATION STATE
  // =========================================================

  const [
    loading,
    setLoading,
  ] = useState(false);


  // =========================================================
  // CUSTOMER FILES
  // =========================================================

  const [
    files,
    setFiles,
  ] = useState({
    front: null,
    left: null,
    right: null,
  });


  // =========================================================
  // LOAD DESIGN
  // =========================================================

  useEffect(() => {

    const loadDesign =
      async () => {

        try {

          setLoadingDesign(
            true
          );


          const data =
            await getDesign(
              designId
            );


          console.log(
            "DESIGN DATA:",
            data
          );


          setDesign(
            data
          );

        } catch (error) {

          console.error(
            "FAILED TO LOAD DESIGN:",
            error
          );

        } finally {

          setLoadingDesign(
            false
          );

        }

      };


    if (designId) {
      loadDesign();
    }

  }, [designId]);


  // =========================================================
  // HANDLE IMAGE CHANGE
  // =========================================================

  const handleFileChange =
    (
      view,
      file
    ) => {

      setFiles(
        (previous) => ({
          ...previous,
          [view]: file,
        })
      );

    };


  // =========================================================
  // FORMAT BACKEND ERROR
  // =========================================================

  const getReadableErrorMessage =
    (error) => {

      const responseData =
        error?.response?.data;


      const detail =
        responseData?.detail;


      // Plain string
      if (
        typeof detail ===
        "string"
      ) {
        return detail;
      }


      // FastAPI validation error
      if (
        Array.isArray(
          detail
        )
      ) {

        return detail
          .map(
            (item) => {

              if (
                typeof item ===
                "string"
              ) {
                return item;
              }


              const location =
                Array.isArray(
                  item?.loc
                )
                  ? item.loc.join(
                      " → "
                    )
                  : "";


              const message =
                item?.msg ||
                "Validation error";


              if (location) {
                return `${location}: ${message}`;
              }


              return message;
            }
          )
          .join("\n");

      }


      // Object detail
      if (
        detail &&
        typeof detail ===
          "object"
      ) {

        return (
          detail.message ||
          detail.msg ||
          JSON.stringify(
            detail,
            null,
            2
          )
        );

      }


      // Backend message
      if (
        typeof responseData?.message ===
        "string"
      ) {

        return responseData.message;

      }


      // JavaScript / Axios error
      if (
        typeof error?.message ===
        "string"
      ) {

        return error.message;

      }


      return (
        "Unable to start generation."
      );
    };


  // =========================================================
  // START GENERATION
  // =========================================================

  const handleGenerate =
    async () => {

      const {
        front,
        left,
        right,
      } = files;


      // =====================================================
      // VALIDATE 3 FILES
      // =====================================================

      if (
        !front ||
        !left ||
        !right
      ) {

        alert(
          "Please upload all three customer images."
        );


        return;
      }


      try {

        setLoading(
          true
        );


        // ===================================================
        // IMPORTANT
        //
        // DO NOT upload first and convert to URLs.
        //
        // Backend expects actual UploadFile objects directly
        // in /api/generation/create.
        // ===================================================

        console.log(
          "STARTING GENERATION..."
        );


        console.log(
          "DESIGN ID:",
          designId
        );


        console.log(
          "FRONT FILE:",
          front
        );


        console.log(
          "LEFT FILE:",
          left
        );


        console.log(
          "RIGHT FILE:",
          right
        );




        // ===================================================
        // CREATE GENERATION JOB
        // ===================================================

        const generation =
          await createGeneration({
            design_id:
              designId,

            front:
              front,

            left:
              left,

            right:
              right,

          });


        console.log(
          "GENERATION RESPONSE:",
          generation
        );


        // ===================================================
        // GET JOB ID
        // ===================================================

        const generationId =
          generation?.id ||
          generation?.job_id;


        if (
          !generationId
        ) {

          console.error(
            "GENERATION RESPONSE HAS NO JOB ID:",
            generation
          );


          alert(
            "Generation was created, but the server did not return a job ID."
          );


          return;
        }


        // ===================================================
        // GO TO PROGRESS PAGE
        // ===================================================

        navigate(
          `/generate/${generationId}`
        );

      } catch (error) {

        console.error(
          "GENERATION FAILED:",
          error
        );


        console.error(
          "BACKEND RESPONSE:",
          error?.response?.data
        );


        const message =
          getReadableErrorMessage(
            error
          );


        alert(
          message
        );

      } finally {

        setLoading(
          false
        );

      }

    };


  // =========================================================
  // UPLOAD COUNT
  // =========================================================

  const uploadedCount =
    Object.values(
      files
    ).filter(
      Boolean
    ).length;


  // =========================================================
  // LOADING
  // =========================================================

  if (
    loadingDesign
  ) {

    return (
      <div className="loading-page">
        Loading design...
      </div>
    );

  }


  // =========================================================
  // DESIGN NOT FOUND
  // =========================================================

  if (!design) {

    return (
      <div className="empty-state">

        <div>

          <h2>
            Design not found
          </h2>


          <button
            className="secondary-button"

            onClick={() =>
              navigate("/portal")
            }

            type="button"
          >
            Back to Designs
          </button>

        </div>

      </div>
    );

  }


  // =========================================================
  // PAGE
  // =========================================================

  return (
    <div className="details-page">

      <div className="details-shell">


        {/* =================================================
            TOP BAR
        ================================================= */}

        <div className="details-topbar">

          <button
            className="back-button"

            onClick={() =>
              navigate("/portal")
            }

            type="button"
          >

            <span>
              ←
            </span>

            Back to Designs

          </button>


          <div className="details-step-badge">
            Step 2 of 3
          </div>

        </div>


        {/* =================================================
            MAIN
        ================================================= */}

        <div className="details-container">


          {/* ===============================================
              LEFT SIDE
          =============================================== */}

          <section className="selected-design">

            <div className="selected-design-heading">

              <span className="eyebrow">
                Selected Design
              </span>


              <h2>
                Your Style
              </h2>

            </div>


            <div className="selected-design-image">

              <img
                src={
                  design.image_url
                }

                alt={
                  design.name ||
                  "Selected Design"
                }
              />


              <span className="selected-design-chip">
                Selected
              </span>

            </div>


            <div className="selected-design-meta">

              <span>

                {
                  design.code ||
                  "Fashion Design"
                }

              </span>


              <h3>

                {
                  design.name ||
                  "Selected Style"
                }

              </h3>


              <p>
                This garment will be
                used as the reference
                design for the AI
                fashion visualization.
              </p>

            </div>

          </section>


          {/* ===============================================
              RIGHT SIDE
          =============================================== */}

          <section className="upload-section">


            <div className="upload-section-header">

              <span className="eyebrow">
                Personalize Your Look
              </span>


              <h1>
                Upload Customer Images
              </h1>


              <p>
                Add three clear full-body
                photographs to generate
                a consistent multi-angle
                fashion preview.
              </p>

            </div>


            {/* =============================================
                UPLOAD COUNT
            ============================================= */}

            <div className="upload-progress-summary">

              <div>

                <strong>
                  {uploadedCount}/3
                </strong>


                <span>
                  views uploaded
                </span>

              </div>


              <div className="upload-progress-mini">

                <div
                  style={{
                    width:
                      `${
                        uploadedCount / 3 *
                        100
                      }%`,
                  }}
                />

              </div>

            </div>


            {/* =============================================
                UPLOAD GRID
            ============================================= */}

            <div className="upload-grid">


              <ImageUploader
                disabled={loading}
                label="Front View"

                file={
                  files.front
                }

                onChange={
                  (file) =>
                    handleFileChange(
                      "front",
                      file
                    )
                }
              />


              <ImageUploader
                disabled={loading}
                label="Left View"

                file={
                  files.left
                }

                onChange={
                  (file) =>
                    handleFileChange(
                      "left",
                      file
                    )
                }
              />


              <ImageUploader
                disabled={loading}
                label="Right View"

                file={
                  files.right
                }

                onChange={
                  (file) =>
                    handleFileChange(
                      "right",
                      file
                    )
                }
              />





            </div>


            {/* =============================================
                PHOTO GUIDANCE
            ============================================= */}

            <div className="upload-guidance">

              <span>
                ✓
              </span>


              <div>
                Use clear, well-lit,
                full-body photographs
                with minimal background
                obstruction.
              </div>

            </div>


            {/* =============================================
                GENERATE BUTTON
            ============================================= */}

            <button
              className="generate-button premium-generate-button"

              onClick={
                handleGenerate
              }

              disabled={
                loading
              }

              type="button"
            >

              {
                loading
                  ? "Starting AI Generation..."
                  : "Generate AI Fashion Preview"
              }


              {!loading && (
                <span>
                  →
                </span>
              )}

            </button>

            {loading && (
              <div
                className="ff-generation-overlay"
                role="status"
                aria-live="polite"
              >
                <style>{`
                  .ff-generation-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    background: rgba(15, 23, 42, .45);
                    backdrop-filter: blur(6px);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                  }

                  .ff-generation-loader-card {
                    width: min(360px, 95vw);
                    text-align: center;
                    background: #ffffff;
                    border-radius: 22px;
                    padding: 35px 26px;
                    box-shadow: 0 20px 70px rgba(0,0,0,.18);
                  }

                  .ff-generation-loader-spinner {
                    width: 54px;
                    height: 54px;
                    margin: 0 auto 22px;
                    border: 4px solid #ffedd5;
                    border-top-color: #f97316;
                    border-radius: 50%;
                    animation: ff-job-spin .8s linear infinite;
                  }

                  .ff-generation-loader-card h3 {
                    margin: 0 0 10px;
                    color: #17263c;
                    font-size: 21px;
                  }

                  .ff-generation-loader-card p {
                    color: #64748b;
                    font-size: 13px;
                    line-height: 1.7;
                    margin: 0;
                  }

                  @keyframes ff-job-spin {
                    to { transform: rotate(360deg); }
                  }

                  @media (prefers-reduced-motion: reduce) {
                    .ff-generation-loader-spinner {
                      animation-duration: 2s;
                    }
                  }
                `}</style>

                <div className="ff-generation-loader-card">
                  <div className="ff-generation-loader-spinner" />

                  <h3>Preparing Your Fashion Preview</h3>

                  <p>
                    Please wait while we prepare your
                    customer photographs and selected outfit.
                  </p>

                  <p style={{ marginTop: 12 }}>
                    Do not refresh or close this page.
                  </p>
                </div>
              </div>
            )}



          </section>


        </div>

      </div>

    </div>
  );
}