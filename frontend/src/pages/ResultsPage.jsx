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
  retryGeneration,
} from "../services/api";


// FF_REFRESH_RETRY_V5

const refreshRetryConsumed = new Set();

const initialNavigation =
  window.performance
    .getEntriesByType("navigation")[0];

const isBrowserRefresh = () => {
  if (initialNavigation?.type !== "reload") {
    return false;
  }

  const initialUrl = new URL(
    initialNavigation.name
  );

  return (
    initialUrl.pathname === window.location.pathname &&
    initialUrl.search === window.location.search
  );
};

export default function ResultsPage() {
  const {
    jobId,
  } = useParams();


  const navigate = useNavigate();

  // FF_DIRECT_RESULTS_V1

  const [generationError, setGenerationError] =
    useState("");

  const [connectionError, setConnectionError] =
    useState("");


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
    let active = true;
    let timer = null;
    let initialStatusChecked = false;

    const canRetryOnRefresh = isBrowserRefresh();

    setJob(null);
    setPreviewIndex(null);
    setGenerationError("");
    setConnectionError("");

    if (!jobId) {
      setGenerationError("Generation job ID is missing.");
      return;
    }

    const load = async () => {
      try {
        const data = await getGeneration(jobId);

        if (!active) return;

        const shouldRetry =
          !initialStatusChecked &&
          canRetryOnRefresh &&
          !refreshRetryConsumed.has(jobId) &&
          data.status === "failed";

        initialStatusChecked = true;

        if (canRetryOnRefresh) {
          refreshRetryConsumed.add(jobId);
        }

        setJob(
          shouldRetry
            ? { ...data, status: "pending" }
            : data
        );

        setConnectionError("");

        if (data.status === "failed") {

          if (shouldRetry) {

            setGenerationError("");

            setConnectionError(
              "Retrying unfinished images..."
            );

            try {

              const retryResult =
                await retryGeneration(jobId);

              if (!active) return;

              if (
                retryResult.status === "pending" ||
                retryResult.status === "processing" ||
                retryResult.status === "generating" ||
                retryResult.status === "completed"
              ) {

                setJob({
                  ...data,
                  status: retryResult.status === "completed"
                    ? "processing"
                    : retryResult.status,
                  error_message: null,
                });

                setGenerationError("");
                setConnectionError("");

                console.info(
                  "[FashionFit V5] Refresh retry:",
                  retryResult
                );

                timer = setTimeout(load, 1000);

                return;
              }

              setJob(data);
              setConnectionError("");

              setGenerationError(
                "Generation could not be restarted."
              );

              return;

            } catch (retryError) {

              if (!active) return;

              console.error(
                "Generation retry error:",
                retryError
              );

              const detail =
                retryError?.response?.data?.detail;

              setJob(data);
              setConnectionError("");

              setGenerationError(
                typeof detail === "string"
                  ? detail
                  : data.error_message ||
                    "Unable to restart generation. Please refresh again."
              );

              return;
            }
          }

          setGenerationError(
            data.error_message ||
            "Image generation failed. Refresh the page to retry."
          );

          return;
        }

        setGenerationError("");

        if (data.status === "completed") {
          const allReady = [
            "front",
            "left",
            "right",
          ].every(
            view => Boolean(data[`output_${view}_url`])
          );

          if (!allReady) {
            setGenerationError(
              "Some generated images are unavailable."
            );
          }

          return;
        }

      } catch (error) {
        if (!active) return;

        console.error(
          "Generation polling error:",
          error
        );

        if ([401, 403, 404, 410].includes(
          error?.response?.status
        )) {
          setConnectionError("");
          setGenerationError(
            "This generation session is no longer accessible."
          );
          return;
        }

        setConnectionError(
          "Connection interrupted. Reconnecting..."
        );
      }

      if (active) {
        timer = setTimeout(load, 2000);
      }
    };

    load();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);





  // Compact results opening position

  useEffect(() => {

    let secondFrame;

    const firstFrame = requestAnimationFrame(() => {

      secondFrame = requestAnimationFrame(() => {

        const section = document.getElementById(
          "ff-results-start"
        );

        section?.scrollIntoView({
          behavior: "instant",
          block: "start",
        });

      });

    });

    return () => {
      cancelAnimationFrame(firstFrame);

      if (secondFrame !== undefined) {
        cancelAnimationFrame(secondFrame);
      }
    };

  }, [jobId]);

  const previewImages = [
    {
      title: "Front View",
      image: job?.output_front_url,
    },
    {
      title: "Left View",
      image: job?.output_left_url,
    },
    {
      title: "Right View",
      image: job?.output_right_url,
    },
  ];

  const readyCount = previewImages.filter(
    item => Boolean(item.image)
  ).length;

  const generationComplete =
    job?.status === "completed" &&
    readyCount === previewImages.length &&
    !generationError;

  const generationFailed =
    Boolean(generationError) ||
    job?.status === "failed";

  const progress = generationComplete
    ? 100
    : Math.min(
        100,
        Math.max(0, Number(job?.progress) || 0)
      );



  // FF_COMPACT_RESULTS_V2

  const activeImageIndex = previewImages.findIndex(
    item => !item.image
  );

  const [imageLoadingState, setImageLoadingState] =
    useState({
      jobId: null,
      index: -1,
      elapsed: 0,
    });

  useEffect(() => {

    if (
      generationFailed ||
      generationComplete ||
      activeImageIndex < 0
    ) {
      return;
    }

    const startedAt = Date.now();

    const updateProgress = () => {
      setImageLoadingState({
        jobId,
        index: activeImageIndex,
        elapsed: (Date.now() - startedAt) / 1000,
      });
    };

    updateProgress();

    const timer = setInterval(
      updateProgress,
      500
    );

    return () => clearInterval(timer);

  }, [
    jobId,
    activeImageIndex,
    generationFailed,
    generationComplete,
  ]);


  const getImageProgress = (index) => {

    if (previewImages[index]?.image) {
      return 100;
    }

    if (index !== activeImageIndex) {
      return 0;
    }

    const elapsed =
      imageLoadingState.jobId === jobId &&
      imageLoadingState.index === index
        ? imageLoadingState.elapsed
        : 0;

    // Estimated visual progress.
    // Only an available image reaches 100%.

    const estimated = Math.floor(
      95 * (1 - Math.exp(-elapsed / 22))
    );

    return Math.min(
      95,
      Math.max(0, estimated)
    );
  };

  const availableImageKey = previewImages
    .map(item => Boolean(item.image))
    .join(",");



  const closePreview =
    () => {

      setPreviewIndex(
        null
      );

    };



  const movePreview = (direction) => {
    setPreviewIndex(current => {

      if (current === null) {
        return null;
      }

      for (
        let step = 1;
        step <= previewImages.length;
        step++
      ) {
        const next = (
          current +
          direction * step +
          previewImages.length
        ) % previewImages.length;

        if (previewImages[next]?.image) {
          return next;
        }
      }

      return current;
    });
  };

  const previousImage = () => movePreview(-1);

  const nextImage = () => movePreview(1);

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
    availableImageKey,
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

      if (!generationComplete) {
        return;
      }


      try {

        const [
          front,
          left,
          right,
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
          70,
          158,
          imageWidth,
          imageHeight,
          "Right View"
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





  return (
    <div className="results-page">
<style>{`

  /* RESULTS INITIAL VIEW POSITION */

  .results-page #ff-results-start {
    scroll-margin-top: 24px;
  }

  .results-page .small-results-grid {
    align-items: stretch !important;
  }

  .results-page .result-photo-stage {
    overflow: hidden !important;
  }

  .results-page .result-photo-stage img {
    object-fit: contain !important;
    object-position: center !important;
  }



  /* FF_PREVIEW_ICON_ALIGNMENT */

  .results-page .image-preview-close,
  .results-page .image-preview-arrow {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
    flex-shrink: 0;
    border-radius: 50% !important;
  }

  .results-page .image-preview-close {
    width: 42px !important;
    height: 42px !important;
  }

  .results-page .image-preview-arrow {
    width: 52px !important;
    height: 52px !important;
  }

  .results-page .image-preview-close svg,
  .results-page .image-preview-arrow svg {
    display: block !important;
    flex-shrink: 0;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    pointer-events: none;
  }

  .results-page .image-preview-arrow {
    top: 50% !important;
    transform: translateY(-50%) !important;
  }


  .results-page .results-shell {
    width: 100%;
    max-width: 1800px;
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
    grid-template-columns:
      repeat(3, minmax(0, 1fr)) !important;
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


  /* FASHIONFIT DIRECT RESULTS UI */

  .results-page .ff-image-percentage-ring {
    position: relative;
    width: 105px;
    height: 105px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .results-page .ff-image-percentage-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    overflow: visible;
  }

  .results-page .ff-image-ring-track {
    fill: none;
    stroke: #e5e7eb;
    stroke-width: 7;
  }

  .results-page .ff-image-ring-progress {
    fill: none;
    stroke: #f97316;
    stroke-width: 7;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.8s ease;
  }

  .results-page .ff-image-percentage-value {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 750;
    color: #17243b;
    font-variant-numeric: tabular-nums;
  }

  .results-page .ff-image-loading-title {
    font-size: 13px;
    font-weight: 650;
    color: #f97316;
  }

  .results-page .ff-image-loading-subtitle {
    font-size: 12px;
    color: #64748b;
  }

  .results-page .ff-result-placeholder {
    gap: 10px;
    background: #f8fafc;
  }

  @media (max-width: 600px) {
    .results-page .ff-image-percentage-ring {
      width: 75px;
      height: 75px;
    }

    .results-page .ff-image-percentage-value {
      font-size: 18px;
    }
  }



  .ff-results-progress {
    margin-bottom: 20px;
    padding: 16px 20px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
  }

  .ff-results-progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 650;
    color: #17243b;
  }

  .ff-results-progress-track {
    height: 6px;
    border-radius: 20px;
    background: #e5e7eb;
    overflow: hidden;
  }

  .ff-results-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: #f97316;
    transition: width 0.4s ease;
  }

  .ff-results-progress-fill.complete {
    background: #16a34a;
  }

  .ff-result-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 100%;
    color: #64748b;
    font-size: 13px;
    text-align: center;
    padding: 12px;
  }

  .ff-result-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #fed7aa;
    border-top-color: #f97316;
    border-radius: 50%;
    animation: ffResultSpin 0.8s linear infinite;
  }

  @keyframes ffResultSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .ff-results-error {
    padding: 14px;
    margin-top: 12px;
    border-radius: 10px;
    background: #fef2f2;
    color: #b91c1c;
  }

  .ff-results-connection {
    color: #b45309;
    font-size: 13px;
    padding-top: 12px;
  }

  .results-page .clickable-result:disabled {
    opacity: 1 !important;
    cursor: default;
  }

  .results-page .download-pdf-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results-page .results-complete-pill.pending {
    background: #fff7ed !important;
    color: #c2410c !important;
  }

  .results-page .results-complete-pill.failed {
    background: #fef2f2 !important;
    color: #b91c1c !important;
  }

  @media (max-width: 1000px) {
    .results-page .small-results-grid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 600px) {
    .ff-results-progress {
      padding: 12px;
    }

    .ff-results-progress-header {
      font-size: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ff-result-spinner {
      animation: none;
    }
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


  /* COMPACT RESULTS SCREEN V2 */

  .results-page {
    padding-top: 8px !important;
  }

  .results-page .results-shell {
    width: 100% !important;
    max-width: 1800px !important;
    margin: 0 auto !important;
  }

  /* Remove unnecessary introductory space */

  .results-page .results-hero {
    display: none !important;
  }

  .results-page .results-topbar {
    display: none !important;
  }

  /* Position progress bar at top */

  .results-page #ff-results-start {
    scroll-margin-top: 8px !important;
  }

  .results-page .ff-results-progress {
    margin-top: 0 !important;
    margin-bottom: 20px !important;
    padding: 15px 20px !important;
    border-radius: 14px !important;
  }

  .results-page .ff-results-progress-header {
    margin-bottom: 10px !important;
    font-size: 13px !important;
  }

  .results-page .ff-results-progress-track {
    height: 6px !important;
  }

  /* Three-image section */

  .results-page .generated-results-section {
    padding: 18px !important;
    margin: 0 !important;
    border-radius: 18px !important;
  }

  .results-page .generated-results-section .panel-head {
    margin-bottom: 14px !important;
    padding-bottom: 0 !important;
  }

  .results-page .generated-results-section .panel-badge {
    width: fit-content !important;
    max-width: 100% !important;
  }

  .results-page .generated-results-section h2 {
    margin: 6px 0 !important;
  }

  .results-page .generated-results-section p {
    margin: 4px 0 !important;
  }

  .results-page .small-results-grid {
    gap: 16px !important;
    align-items: stretch !important;
  }

  /* Reduce height only when the screen requires it */

  @media (min-width: 1001px) {

    .results-page .small-results-grid {
      grid-template-columns:
        repeat(3, minmax(0, 1fr)) !important;
    }

    .results-page .result-photo-stage {
      height: min(
        clamp(320px, 48vh, 620px),
        max(220px, calc(100dvh - 235px))
      ) !important;
    }

  }

  .results-page .result-photo-stage img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
  }

  .results-page .result-photo-label {
    padding: 10px !important;
    line-height: 1.5 !important;
  }

  /* Smaller preview navigation buttons */

  .results-page .image-preview-arrow {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px !important;
    min-height: 30px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    line-height: 1 !important;
    border-radius: 50% !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }

  .results-page .image-preview-arrow-left {
    left: 10px !important;
  }

  .results-page .image-preview-arrow-right {
    right: 10px !important;
  }

  .results-page .image-preview-close {
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    min-height: 28px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    line-height: 1 !important;
    top: 10px !important;
    right: 10px !important;
    border-radius: 50% !important;
  }

  .results-page .image-preview-arrow svg {
    width: 15px !important;
    height: 15px !important;
    display: block !important;
    margin: 0 !important;
    flex-shrink: 0 !important;
  }

  .results-page .image-preview-close svg {
    width: 14px !important;
    height: 14px !important;
    display: block !important;
    margin: 0 !important;
    flex-shrink: 0 !important;
  }

  /* Compact percentage loader */

  .results-page .ff-image-percentage-ring {
    width: 78px !important;
    height: 78px !important;
  }

  .results-page .ff-image-percentage-value {
    font-size: 20px !important;
    font-weight: 700 !important;
  }

  .results-page .ff-result-placeholder {
    gap: 8px !important;
  }

  .results-page .ff-image-loading-title {
    font-size: 13px !important;
    margin: 0 !important;
  }

  .results-page .ff-image-loading-subtitle {
    font-size: 11px !important;
    color: #94a3b8 !important;
  }

  @media (max-width: 1000px) {

    .results-page .small-results-grid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr)) !important;
    }

  }

  @media (max-width: 600px) {

    .results-page .generated-results-section {
      padding: 12px !important;
    }

    .results-page .small-results-grid {
      gap: 8px !important;
    }

    .results-page .ff-image-percentage-ring {
      width: 65px !important;
      height: 65px !important;
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


          <span
  className={
    "results-complete-pill " +
    (
      generationFailed
        ? "failed"
        : generationComplete
          ? ""
          : "pending"
    )
  }
>
  {generationFailed
    ? "Generation Interrupted"
    : generationComplete
      ? "Generation Complete"
      : `Generating ${readyCount}/${previewImages.length}`}
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



        <div
          id="ff-results-start"
          className="ff-results-progress"
        >

          <div
            className="ff-results-progress-header"
            role="status"
          >
            <span>
              {generationFailed
                ? "Generation interrupted"
                : generationComplete
                  ? "All images generated"
                  : "Generating your fashion preview"}
            </span>

            <span>
              {readyCount}/{previewImages.length} Ready |
              {" "}{Math.round(progress)}%
            </span>
          </div>

          <div
            className="ff-results-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className={
                "ff-results-progress-fill " +
                (generationComplete ? "complete" : "")
              }
              style={{ width: `${progress}%` }}
            />
          </div>

          {connectionError && (
            <div
              className="ff-results-connection"
              role="status"
            >
              {connectionError}
            </div>
          )}

          {generationError && (
            <div
              className="ff-results-error"
              role="alert"
            >
              {generationError}
            </div>
          )}

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
  {readyCount}/{previewImages.length} Ready
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
          <div className="ff-result-placeholder">

  <div className="ff-image-percentage-ring">

    <svg
      viewBox="0 0 120 120"
      className="ff-image-percentage-svg"
      aria-hidden="true"
    >

      <circle
        cx="60"
        cy="60"
        r="52"
        className="ff-image-ring-track"
      />

      <circle
        cx="60"
        cy="60"
        r="52"
        className="ff-image-ring-progress"
        strokeDasharray="326.7256"
        strokeDashoffset={
          326.7256 *
          (1 - getImageProgress(index) / 100)
        }
      />

    </svg>

    <div className="ff-image-percentage-value">
      {getImageProgress(index)}%
    </div>

  </div>

  <span className="ff-image-loading-title">
    {generationFailed
      ? "Generation interrupted"
      : job?.status === "completed"
        ? "Image unavailable"
        : index === activeImageIndex
          ? "Generating..."
          : "Waiting..."}
  </span>

  <span className="ff-image-loading-subtitle">
    {generationFailed
      ? item.title
      : index === activeImageIndex
        ? "Estimated progress"
        : "Waiting in queue"}
  </span>

</div>
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
            disabled={!generationComplete}
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
                 aria-label="Close image preview">

        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6L18 18M18 6L6 18" />
        </svg>
    </button>


                <button
                  className="image-preview-arrow image-preview-arrow-left"
                  onClick={
                    previousImage
                  }
                  type="button"
                 aria-label="Previous image">

        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5L8 12L15 19" />
        </svg>
    </button>


                <button
                  className="image-preview-arrow image-preview-arrow-right"
                  onClick={
                    nextImage
                  }
                  type="button"
                 aria-label="Next image">

        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 5L16 12L9 19" />
        </svg>
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



