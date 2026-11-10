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

import ResultCard from "../components/ResultCard";

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

              {previewImages.map(
                (
                  item,
                  index
                ) => (

                  <div
                    className="clickable-result"
                    key={
                      item.title
                    }
                    onClick={() =>
                      setPreviewIndex(
                        index
                      )
                    }
                  >

                    <ResultCard
                      title={
                        item.title
                      }
                      image={
                        item.image
                      }
                    />

                  </div>

                )
              )}

            </div>

          </section>


          <aside className="measurement-panel">

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
              title="Top Measurements"
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
              title="Bottom Measurements"
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
              navigate("/")
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
                  ×
                </button>


                <button
                  className="image-preview-arrow image-preview-arrow-left"
                  onClick={
                    previousImage
                  }
                  type="button"
                >
                  ‹
                </button>


                <button
                  className="image-preview-arrow image-preview-arrow-right"
                  onClick={
                    nextImage
                  }
                  type="button"
                >
                  ›
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