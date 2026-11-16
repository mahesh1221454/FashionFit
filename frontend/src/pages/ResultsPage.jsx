import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  jsPDF,
} from "jspdf";



import {
  getGeneration,
} from "../services/api";


export default function ResultsPage() {
  const {
    jobId,
  } = useParams();

  const navigate =
    useNavigate();


  const [
    job,
    setJob,
  ] = useState(null);


  const [
    previewIndex,
    setPreviewIndex,
  ] = useState(null);


  const [
    measurements,
    setMeasurements,
  ] = useState({

    shoulderWidth: "",
    chestCircumference: "",
    topWaistCircumference: "",
    hipCircumference: "",
    neckCircumference: "",
    sleeveLength: "",
    bicepCircumference: "",
    armholeCircumference: "",
    shirtLength: "",

    bottomWaistCircumference: "",
    hipSeatCircumference: "",
    thighCircumference: "",
    frontBackRise: "",
    inseamLength: "",
    outseamLength: "",
    ankleOpening: "",

  });


  useEffect(() => {

    const load =
      async () => {

        try {

          const data =
            await getGeneration(
              jobId
            );


          setJob(
            data
          );

        } catch (error) {

          console.error(
            "Failed to load generation:",
            error
          );

        }

      };


    load();

  }, [jobId]);


  const previewImages =
    job
      ? [
          {
            title:
              "Front View",

            image:
              job.output_front_url,
          },

          {
            title:
              "Left View",

            image:
              job.output_left_url,
          },

          {
            title:
              "Right View",

            image:
              job.output_right_url,
          },

          {
            title:
              "Back View",

            image:
              job.output_back_url,
          },
        ]
      : [];


  const closePreview =
    () => {

      setPreviewIndex(
        null
      );

    };


  const previousImage =
    () => {

      setPreviewIndex(
        (current) =>
          current === 0
            ? previewImages.length -
              1
            : current - 1
      );

    };


  const nextImage =
    () => {

      setPreviewIndex(
        (current) =>
          current ===
          previewImages.length -
            1
            ? 0
            : current + 1
      );

    };


  useEffect(() => {

    const handleKeyboard =
      (event) => {

        if (
          previewIndex ===
          null
        ) {
          return;
        }


        if (
          event.key ===
          "Escape"
        ) {

          closePreview();

        }


        if (
          event.key ===
          "ArrowLeft"
        ) {

          previousImage();

        }


        if (
          event.key ===
          "ArrowRight"
        ) {

          nextImage();

        }

      };


    window.addEventListener(
      "keydown",
      handleKeyboard
    );


    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyboard
      );

  }, [
    previewIndex,
    previewImages.length,
  ]);


  const handleMeasurementChange =
    (
      field,
      value
    ) => {

      setMeasurements(
        (previous) => ({
          ...previous,
          [field]:
            value,
        })
      );

    };


  const imageUrlToDataUrl =
    (url) =>
      new Promise(
        (
          resolve,
          reject
        ) => {

          if (!url) {

            resolve(
              null
            );

            return;

          }


          const image =
            new Image();


          image.crossOrigin =
            "anonymous";


          const separator =
            url.includes("?")
              ? "&"
              : "?";


          image.src =
            `${url}${separator}pdf=${Date.now()}`;


          image.onload =
            () => {

              try {

                const canvas =
                  document.createElement(
                    "canvas"
                  );


                canvas.width =
                  image.naturalWidth;


                canvas.height =
                  image.naturalHeight;


                const context =
                  canvas.getContext(
                    "2d"
                  );


                context.fillStyle =
                  "#ffffff";


                context.fillRect(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );


                context.drawImage(
                  image,
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );


                resolve(
                  canvas.toDataURL(
                    "image/jpeg",
                    0.92
                  )
                );

              } catch (error) {

                reject(
                  error
                );

              }

            };


          image.onerror =
            reject;

        }
      );


  const addPdfImage =
    (
      pdf,
      imageData,
      x,
      y,
      boxWidth,
      boxHeight,
      label
    ) => {

      if (!imageData) {
        return;
      }


      const properties =
        pdf.getImageProperties(
          imageData
        );


      const ratio =
        Math.min(
          boxWidth /
            properties.width,

          boxHeight /
            properties.height
        );


      const width =
        properties.width *
        ratio;


      const height =
        properties.height *
        ratio;


      const finalX =
        x +
        (
          boxWidth -
          width
        ) /
          2;


      const finalY =
        y +
        (
          boxHeight -
          height
        ) /
          2;


      pdf.setFillColor(
        247,
        246,
        243
      );


      pdf.roundedRect(
        x,
        y,
        boxWidth,
        boxHeight,
        3,
        3,
        "F"
      );


      pdf.addImage(
        imageData,
        "JPEG",
        finalX,
        finalY,
        width,
        height,
        undefined,
        "FAST"
      );


      pdf.setFontSize(
        9
      );


      pdf.setTextColor(
        45,
        45,
        45
      );


      pdf.text(
        label,
        x +
          boxWidth /
            2,
        y +
          boxHeight +
          6,
        {
          align:
            "center",
        }
      );

    };


  const downloadMeasurementPDF =
    async () => {

      if (!job) {
        return;
      }


      try {

        const [
          front,
          left,
          right,
          back,
        ] =
          await Promise.all([
            imageUrlToDataUrl(
              job.output_front_url
            ),

            imageUrlToDataUrl(
              job.output_left_url
            ),

            imageUrlToDataUrl(
              job.output_right_url
            ),

            imageUrlToDataUrl(
              job.output_back_url
            ),
          ]);


        const pdf =
          new jsPDF({
            orientation:
              "portrait",

            unit:
              "mm",

            format:
              "a4",
          });


        pdf.setTextColor(
          145,
          105,
          65
        );


        pdf.setFontSize(
          8
        );


        pdf.text(
          "AI FASHION VISUALIZATION",
          105,
          14,
          {
            align:
              "center",
          }
        );


        pdf.setTextColor(
          20,
          20,
          20
        );


        pdf.setFontSize(
          21
        );


        pdf.text(
          "Your Generated Look",
          105,
          25,
          {
            align:
              "center",
          }
        );


        pdf.setTextColor(
          110,
          110,
          110
        );


        pdf.setFontSize(
          8
        );


        pdf.text(
          `Generation ID: ${jobId}`,
          105,
          33,
          {
            align:
              "center",
          }
        );


        const imageWidth =
          70;

        const imageHeight =
          100;


        addPdfImage(
          pdf,
          front,
          28,
          42,
          imageWidth,
          imageHeight,
          "Front View"
        );


        addPdfImage(
          pdf,
          left,
          112,
          42,
          imageWidth,
          imageHeight,
          "Left View"
        );


        addPdfImage(
          pdf,
          right,
          28,
          158,
          imageWidth,
          imageHeight,
          "Right View"
        );


        addPdfImage(
          pdf,
          back,
          112,
          158,
          imageWidth,
          imageHeight,
          "Back View"
        );


        pdf.addPage();


        let y =
          20;


        pdf.setTextColor(
          20,
          20,
          20
        );


        pdf.setFontSize(
          20
        );


        pdf.text(
          "Tailoring Measurements",
          20,
          y
        );


        y += 15;


        const printSection =
          (
            title,
            values
          ) => {

            pdf.setFontSize(
              14
            );


            pdf.setTextColor(
              20,
              20,
              20
            );


            pdf.text(
              title,
              20,
              y
            );


            y += 10;


            pdf.setFontSize(
              10
            );


            values.forEach(
              (
                [
                  label,
                  value,
                ]
              ) => {

                pdf.setTextColor(
                  80,
                  80,
                  80
                );


                pdf.text(
                  label,
                  25,
                  y
                );


                pdf.setTextColor(
                  20,
                  20,
                  20
                );


                pdf.text(
                  value
                    ? `${value} in`
                    : "-",
                  125,
                  y
                );


                y +=
                  8;

              }
            );


            y +=
              8;

          };


        printSection(
          "Top Measurements",
          [
            [
              "Shoulder Width",
              measurements.shoulderWidth,
            ],

            [
              "Chest Circumference",
              measurements.chestCircumference,
            ],

            [
              "Waist Circumference",
              measurements.topWaistCircumference,
            ],

            [
              "Hip Circumference",
              measurements.hipCircumference,
            ],

            [
              "Neck Circumference",
              measurements.neckCircumference,
            ],

            [
              "Sleeve Length",
              measurements.sleeveLength,
            ],

            [
              "Bicep Circumference",
              measurements.bicepCircumference,
            ],

            [
              "Armhole Circumference",
              measurements.armholeCircumference,
            ],

            [
              "Shirt / Top Length",
              measurements.shirtLength,
            ],
          ]
        );


        printSection(
          "Bottom Measurements",
          [
            [
              "Waist Circumference",
              measurements.bottomWaistCircumference,
            ],

            [
              "Hip / Seat Circumference",
              measurements.hipSeatCircumference,
            ],

            [
              "Thigh Circumference",
              measurements.thighCircumference,
            ],

            [
              "Front / Back Rise",
              measurements.frontBackRise,
            ],

            [
              "Inseam Length",
              measurements.inseamLength,
            ],

            [
              "Outseam / Full Pant Length",
              measurements.outseamLength,
            ],

            [
              "Bottom / Ankle Opening",
              measurements.ankleOpening,
            ],
          ]
        );


        pdf.save(
          `fashion-ai-report-${jobId}.pdf`
        );

      } catch (error) {

        console.error(
          "PDF generation failed:",
          error
        );


        alert(
          "Unable to generate PDF."
        );

      }

    };


  if (!job) {

    return (
      <div className="loading-page">
        Loading results...
      </div>
    );

  }


  return (
    <div className="results-page">
<style>{`
  .results-page .results-shell {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }

  .results-page .results-workspace {
    display: flex !important;
    flex-direction: column !important;
    width: 100%;
    gap: 24px;
  }

  .results-page .generated-results-section {
    width: 100% !important;
    min-width: 0;
    padding: 20px;
    border-radius: 18px;
  }

  .results-page .small-results-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 16px;
    align-items: stretch;
  }

  .results-page .clickable-result {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
    cursor: pointer;
    padding: 0 !important;
    box-shadow: none !important;
    transform: none !important;
    transition: border-color .2s ease;
  }

  .results-page .clickable-result:hover {
    border-color: #f97316;
  }

  .results-page .result-photo-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: clamp(320px, 48vh, 620px);
    background: #f8f9fa;
    overflow: hidden;
  }

  .results-page .result-photo-stage img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain !important;
    object-position: center;
    transform: none !important;
    filter: none !important;
    opacity: 1 !important;
  }

  .results-page .result-photo-label {
    display: block;
    text-align: center;
    font-size: 14px;
    font-weight: 650;
    padding: 12px;
    border-top: 1px solid #e5e7eb;
    color: #17243b;
  }

  .results-page .measurement-panel {
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 18px;
    padding: 20px;
    border-radius: 18px;
  }

  .results-page .measurement-panel > .panel-head {
    grid-column: 1 / -1;
  }

  .results-page .measurement-section {
    min-width: 0;
    width: 100%;
    padding: 16px;
    margin: 0;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .results-page .measurement-fields {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .results-page .measurement-field {
    min-width: 0;
  }

  .results-page .measurement-input-wrapper input {
    width: 100%;
    min-width: 0;
  }

  .results-page .results-bottom-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    padding: 22px 0;
  }

  .results-page .download-pdf-button {
    min-height: 45px;
    padding: 12px 28px;
    border-radius: 10px;
    font-weight: 650;
  }

  @media (max-width: 900px) {
    .results-page .measurement-fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .results-page .result-photo-stage {
      height: clamp(260px, 42vh, 450px);
    }
  }

  @media (max-width: 600px) {
    .results-page .results-shell {
      width: 100%;
      padding: 10px;
    }

    .results-page .generated-results-section,
    .results-page .measurement-panel {
      padding: 12px;
    }

    .results-page .small-results-grid {
      gap: 8px;
    }

    .results-page .result-photo-stage {
      height: clamp(170px, 58vw, 300px);
    }

    .results-page .result-photo-label {
      font-size: 12px;
      padding: 9px;
    }

    .results-page .measurement-panel {
      grid-template-columns: minmax(0, 1fr);
    }

    .results-page .measurement-fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .results-page .results-bottom-actions button {
      width: 100%;
    }
  }

  @media (max-width: 360px) {
    .results-page .measurement-fields {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`}</style>

      <div className="results-shell">


        <div className="results-topbar">

          <button
            className="back-button"
            onClick={() =>
              navigate(-1)
            }
            type="button"
          >
            ← Back
          </button>


          <span className="results-complete-pill">
            ✓ Generation Complete
          </span>

        </div>


        <div className="results-hero">

          <span className="results-hero-badge">
            AI FASHION STUDIO
          </span>


          <h1>
            Your Generated Look
          </h1>


          <p>
            Review all generated angles and
            complete the tailoring
            measurements for the final
            customer report.
          </p>

        </div>


        <div className="results-workspace">


          <section className="generated-results-section">

            <div className="panel-head panel-head-row">

              <div>

                <span className="panel-badge">
                  Generated Preview
                </span>

                <h2>
                  Customer Views
                </h2>

                <p>
                  Select any image for
                  full-screen inspection.
                </p>

              </div>


              <div className="four-view-badge">
                4 Views
              </div>

            </div>


            <div className="small-results-grid">
  {previewImages.map((item, index) => (
    <button
      type="button"
      className="clickable-result"
      key={item.title}
      aria-label={`Inspect ${item.title}`}
      disabled={!item.image}
      onClick={() => setPreviewIndex(index)}
    >
      <div className="result-photo-stage">
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            draggable={false}
          />
        ) : (
          <span>Image unavailable</span>
        )}
      </div>

      <span className="result-photo-label">
        {item.title}
      </span>
    </button>
  ))}
</div>
</section>


          <aside className="measurement-panel">

<style>{`
  /* PREMIUM TAILORING MEASUREMENTS */

  .measurement-panel {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 24px !important;
    padding: 26px !important;
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 20px !important;
    align-items: stretch !important;
  }

  .measurement-panel .panel-head {
    grid-column: 1 / -1;
    padding-bottom: 18px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 0 !important;
  }

  .measurement-panel .panel-badge {
    display: inline-flex !important;
    width: fit-content !important;
    background: #fff1e6 !important;
    color: #c2410c !important;
    padding: 7px 12px !important;
    border-radius: 6px;
    font-size: 11px !important;
    font-weight: 700;
    letter-spacing: 0.8px;
  }

  .measurement-panel .panel-head h2 {
    color: #17243b !important;
    font-size: 26px !important;
    font-weight: 750 !important;
    margin: 12px 0 6px !important;
  }

  .measurement-panel .panel-head p {
    color: #475569 !important;
    font-size: 14px !important;
  }

  .measurement-panel .measurement-section {
    padding: 22px !important;
    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 14px !important;
    margin: 0 !important;
    min-width: 0;
  }

  .measurement-panel .measurement-section h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 17px !important;
    font-weight: 750 !important;
    color: #17243b !important;
    padding: 0 0 16px !important;
    margin: 0 0 18px !important;
    border-bottom: 1px solid #cbd5e1 !important;
  }

  .measurement-panel .measurement-section h3::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 22px;
    background: #f97316;
    border-radius: 4px;
  }

  .measurement-panel .measurement-fields {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 18px 16px !important;
  }

  .measurement-panel .measurement-field {
    min-width: 0;
  }

  .measurement-panel .measurement-field label {
    display: block !important;
    color: #334155 !important;
    font-size: 13px !important;
    font-weight: 650 !important;
    line-height: 1.5;
    margin-bottom: 7px !important;
  }

  .measurement-panel .measurement-input-wrapper {
    display: flex !important;
    align-items: center;
    position: relative;
    background: #ffffff !important;
    border: 1.5px solid #94a3b8 !important;
    border-radius: 9px !important;
    min-height: 46px !important;
    overflow: hidden;
    transition: border-color .2s, box-shadow .2s;
  }

  .measurement-panel .measurement-input-wrapper:hover {
    border-color: #64748b !important;
  }

  .measurement-panel .measurement-input-wrapper:focus-within {
    border-color: #f97316 !important;
    box-shadow: 0 0 0 3px rgba(249,115,22,.13) !important;
  }

  .measurement-panel .measurement-input-wrapper input {
    width: 100% !important;
    min-width: 0 !important;
    height: 44px !important;
    padding: 10px 44px 10px 14px !important;
    background: transparent !important;
    color: #17243b !important;
    font-size: 16px !important;
    font-weight: 600 !important;
    font-variant-numeric: tabular-nums;
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }

  .measurement-panel .measurement-input-wrapper input::placeholder {
    color: #64748b !important;
    opacity: 1 !important;
  }

  .measurement-panel .measurement-input-wrapper span {
    position: absolute !important;
    right: 7px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    background: #eef2f7 !important;
    color: #475569 !important;
    padding: 5px 8px !important;
    border-radius: 5px;
    font-size: 11px !important;
    font-weight: 700 !important;
    pointer-events: none;
  }

  .results-bottom-actions {
    display: flex !important;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 14px !important;
    padding: 22px 12px !important;
  }

  .results-bottom-actions .download-pdf-button {
    min-height: 48px !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    background: #ea580c !important;
    color: #ffffff !important;
    border-radius: 10px !important;
  }

  .results-bottom-actions .download-pdf-button:hover {
    background: #c2410c !important;
  }

  @media (max-width: 900px) {
    .measurement-panel {
      grid-template-columns: minmax(0, 1fr) !important;
      padding: 18px !important;
      gap: 16px !important;
    }
  }

  @media (max-width: 480px) {
    .measurement-panel {
      padding: 14px !important;
    }

    .measurement-panel .measurement-section {
      padding: 14px !important;
    }

    .measurement-panel .measurement-fields {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 14px !important;
    }

    .measurement-panel .panel-head h2 {
      font-size: 21px !important;
    }

    .results-bottom-actions button {
      width: 100% !important;
    }
  }

`}</style>


            <div className="panel-head">

              <span className="panel-badge">
                Tailoring Details
              </span>


              <h2>
                Customer Measurements
              </h2>


              <p>
                Enter verified tailoring
                measurements before
                downloading the report.
              </p>

            </div>


            <MeasurementSection
              title="Upper Body Measurements"
              measurements={
                measurements
              }
              onChange={
                handleMeasurementChange
              }
              fields={[
                [
                  "Shoulder Width",
                  "shoulderWidth",
                ],

                [
                  "Chest Circumference",
                  "chestCircumference",
                ],

                [
                  "Waist Circumference",
                  "topWaistCircumference",
                ],

                [
                  "Hip Circumference",
                  "hipCircumference",
                ],

                [
                  "Neck Circumference",
                  "neckCircumference",
                ],

                [
                  "Sleeve Length",
                  "sleeveLength",
                ],

                [
                  "Bicep Circumference",
                  "bicepCircumference",
                ],

                [
                  "Armhole Circumference",
                  "armholeCircumference",
                ],

                [
                  "Shirt / Top Length",
                  "shirtLength",
                ],
              ]}
            />


            <MeasurementSection
              title="Lower Body Measurements"
              measurements={
                measurements
              }
              onChange={
                handleMeasurementChange
              }
              fields={[
                [
                  "Waist Circumference",
                  "bottomWaistCircumference",
                ],

                [
                  "Hip / Seat Circumference",
                  "hipSeatCircumference",
                ],

                [
                  "Thigh Circumference",
                  "thighCircumference",
                ],

                [
                  "Front / Back Rise",
                  "frontBackRise",
                ],

                [
                  "Inseam Length",
                  "inseamLength",
                ],

                [
                  "Outseam / Full Pant Length",
                  "outseamLength",
                ],

                [
                  "Bottom / Ankle Opening",
                  "ankleOpening",
                ],
              ]}
            />

          </aside>

        </div>


        <div className="results-bottom-actions">

          <button
            className="download-pdf-button"
            onClick={
              downloadMeasurementPDF
            }
            type="button"
          >
            Download Complete PDF
          </button>


          <button
            className="secondary-button"
            onClick={() =>
              navigate("/portal")
            }
            type="button"
          >
            Choose Another Design
          </button>

        </div>


        {previewIndex !== null && (

          <div
            className="image-preview-overlay"
            onClick={
              closePreview
            }
          >

            <div
              className="image-preview-stage"
              onClick={
                (event) =>
                  event.stopPropagation()
              }
            >

              <div className="image-preview-image-shell">

                <img
                  src={
                    previewImages[
                      previewIndex
                    ].image
                  }
                  alt={
                    previewImages[
                      previewIndex
                    ].title
                  }
                />


                <button
                  className="image-preview-close"
                  onClick={
                    closePreview
                  }
                  type="button"
                >
                  &#215;
                </button>


                <button
                  className="image-preview-arrow image-preview-arrow-left"
                  onClick={
                    previousImage
                  }
                  type="button"
                >
                  &#8249;
                </button>


                <button
                  className="image-preview-arrow image-preview-arrow-right"
                  onClick={
                    nextImage
                  }
                  type="button"
                >
                  &#8250;
                </button>

              </div>


              <div className="image-preview-meta">

                <div>

                  <span className="image-preview-kicker">
                    GENERATED VIEW
                  </span>


                  <div className="image-preview-title">
                    {
                      previewImages[
                        previewIndex
                      ].title
                    }
                  </div>

                </div>


                <div className="image-preview-counter">
                  {previewIndex + 1}

                  <span>
                    /
                  </span>

                  {previewImages.length}
                </div>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}


function MeasurementSection({
  title,
  fields,
  measurements,
  onChange,
}) {
  return (
    <div className="measurement-section">

      <h3>
        {title}
      </h3>


      <div className="measurement-fields">

        {fields.map(
          (
            [
              label,
              field,
            ]
          ) => (

            <div
              className="measurement-field"
              key={
                field
              }
            >

              <label>
                {label}
              </label>


              <div className="measurement-input-wrapper">

                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                  value={
                    measurements[
                      field
                    ]
                  }
                  onChange={
                    (event) =>
                      onChange(
                        field,
                        event.target.value
                      )
                  }
                />


                <span>
                  in
                </span>

              </div>

            </div>

          )
        )}

      </div>

    </div>
  );
}



