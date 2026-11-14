import {
  useEffect,
  useRef,
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


export default function GeneratePage() {
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
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  const intervalRef =
    useRef(null);


  useEffect(() => {

    if (!jobId) {

      setError(
        "Generation job ID is missing."
      );

      setLoading(
        false
      );

      return;

    }


    let mounted =
      true;


    const stopPolling =
      () => {

        if (
          intervalRef.current
        ) {

          clearInterval(
            intervalRef.current
          );

          intervalRef.current =
            null;

        }

      };


    const checkGeneration =
      async () => {

        try {

          const data =
            await getGeneration(
              jobId
            );


          if (!mounted) {
            return;
          }


          setJob(
            data
          );


          setLoading(
            false
          );


          if (
            data.status ===
            "completed"
          ) {

            stopPolling();


            navigate(
              `/results/${jobId}`,
              {
                replace: true,
              }
            );


            return;

          }


          if (
            data.status ===
            "failed"
          ) {

            stopPolling();


            setError(
              data.error_message ||
              "Generation failed."
            );

          }

        } catch (error) {

          console.error(
            "Generation polling error:",
            error
          );


          if (!mounted) {
            return;
          }


          setLoading(
            false
          );


          setError(
            "Unable to check generation status."
          );

        }

      };


    checkGeneration();


    intervalRef.current =
      setInterval(
        checkGeneration,
        2000
      );


    return () => {

      mounted =
        false;


      stopPolling();

    };

  }, [
    jobId,
    navigate,
  ]);


  if (
    error
  ) {

    return (
      <div className="generation-page">

        <div className="generation-page-inner">

          <div className="generation-error-card">

            <span className="generation-error-icon">
              !
            </span>


            <span className="generation-eyebrow">
              GENERATION INTERRUPTED
            </span>


            <h2>
              Unable to Create Preview
            </h2>


            <p>
              {error}
            </p>


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

        </div>

      </div>
    );

  }


  const progress =
    Number(
      job?.progress || 0
    );


  return (
    <div className="generation-page">

      <div className="generation-background-glow generation-glow-one" />

      <div className="generation-background-glow generation-glow-two" />


      <div className="generation-page-inner">

        <GenerationProgress job={job}
          progress={
            loading
              ? 0
              : progress
          }
          status={
            getStatusText(
              job?.status,
              progress
            )
          }
        />

      </div>

    </div>
  );
}


function getStatusText(
  status,
  progress
) {
  if (
    status === "pending"
  ) {
    return "Preparing customer photographs";
  }


  if (
    status === "processing"
  ) {

    if (
      progress < 20
    ) {
      return "Preparing visual references";
    }


    if (
      progress < 45
    ) {
      return "Creating the front view";
    }


    if (
      progress < 65
    ) {
      return "Creating side views";
    }


    if (
      progress < 85
    ) {
      return "Creating the back view";
    }


    return "Applying final refinements";

  }


  return "Preparing your fashion preview";
}