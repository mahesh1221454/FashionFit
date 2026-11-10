
import axios from "axios";

/* =========================================================
   ENVIRONMENT CONFIGURATION
========================================================= */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "VITE_API_BASE_URL is missing. " +
    "Configure it in frontend/.env"
  );
}

/* =========================================================
   AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ""),
});

export default api;

/* =========================================================
   GET ALL CATEGORIES
========================================================= */

export const getCategories = async () => {
  const response = await api.get("/categories");

  return response.data;
};

/* =========================================================
   GET DESIGNS BY CATEGORY
========================================================= */

export const getDesigns = async (categoryId) => {
  if (!categoryId) {
    throw new Error("Category ID is required.");
  }

  const response = await api.get(
    `/designs/category/${encodeURIComponent(categoryId)}`
  );

  return response.data;
};

/* =========================================================
   GET SINGLE DESIGN
========================================================= */

export const getDesign = async (designId) => {
  if (!designId) {
    throw new Error("Design ID is required.");
  }

  const response = await api.get(
    `/designs/${encodeURIComponent(designId)}`
  );

  return response.data;
};

/* =========================================================
   UPLOAD SINGLE CUSTOMER IMAGE
========================================================= */

export const uploadSingleImage = async (file) => {
  if (!file) {
    throw new Error("Image file is missing.");
  }

  const formData = new FormData();

  formData.append("file", file);

  const response = await api.post(
    "/uploads",
    formData
  );

  return response.data;
};

/* =========================================================
   CUSTOM DRESS UPLOAD
========================================================= */

export const createCustomDesign = async ({
  file,
  name,
}) => {
  if (!file) {
    throw new Error("Dress image is required.");
  }

  const cleanName = name?.trim();

  if (!cleanName) {
    throw new Error("Dress name is required.");
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("name", cleanName);

  const response = await api.post(
    "/custom-designs",
    formData
  );

  return response.data;
};

/* =========================================================
   CREATE AI GENERATION JOB
========================================================= */

export const createGeneration = async ({
  design_id,
  front,
  left,
  right,
  back,
}) => {
  if (!design_id) {
    throw new Error("Design ID is missing.");
  }

  const images = {
    front,
    left,
    right,
    back,
  };

  const missingImages = Object.entries(images)
    .filter(([, file]) => !file)
    .map(([view]) => view);

  if (missingImages.length > 0) {
    throw new Error(
      `Missing customer images: ${missingImages.join(", ")}`
    );
  }

  const formData = new FormData();

  formData.append("design_id", design_id);

  Object.entries(images).forEach(([view, file]) => {
    formData.append(view, file);
  });

  const response = await api.post(
    "/generation/create",
    formData
  );

  return response.data;
};

/* =========================================================
   GET GENERATION STATUS AND RESULTS
========================================================= */

export const getGeneration = async (jobId) => {
  if (!jobId) {
    throw new Error("Generation job ID is missing.");
  }

  const response = await api.get(
    `/generation/${encodeURIComponent(jobId)}`
  );

  return response.data;
};
