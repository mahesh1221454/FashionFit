import {
  Navigate,
  useParams,
} from "react-router-dom";

export default function GeneratePage() {
  const { jobId } = useParams();

  if (!jobId) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <Navigate
      to={`/results/${jobId}`}
      replace
    />
  );
}
