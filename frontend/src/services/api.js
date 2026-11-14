
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "Missing VITE_API_BASE_URL in frontend/.env"
  );
}

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ""),
});

export default api;

// =====================================================
// CATEGORIES
// =====================================================

export const getCategories = async () => {
  const response = await api.get("/categories");
  return response.data;
};

// =====================================================
// DESIGNS
// =====================================================

export const getDesigns = async (categoryId) => {
  if (!categoryId) {
    throw new Error("Category ID is required.");
  }

  const response = await api.get(
    `/designs/category/${encodeURIComponent(categoryId)}`
  );

  return response.data;
};

export const getDesign = async (designId) => {
  if (!designId) {
    throw new Error("Design ID is required.");
  }

  const response = await api.get(
    `/designs/${encodeURIComponent(designId)}`
  );

  return response.data;
};

// =====================================================
// SINGLE IMAGE UPLOAD
// =====================================================

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

// =====================================================
// PERMANENT CUSTOM DRESS UPLOAD
// =====================================================

export const createCustomDesign = async ({
  file,
  name,
  categoryMode,
  categoryId,
  newCategoryName,
}) => {
  if (!file || !name?.trim()) {
    throw new Error(
      "Dress name and image are required."
    );
  }

  if (!["existing", "new"].includes(categoryMode)) {
    throw new Error("Select a valid category option.");
  }

  if (categoryMode === "existing" && !categoryId) {
    throw new Error("Select an existing category.");
  }

  if (
    categoryMode === "new" &&
    !newCategoryName?.trim()
  ) {
    throw new Error("Enter a new category name.");
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("name", name.trim());
  formData.append("category_mode", categoryMode);

  if (categoryMode === "existing") {
    formData.append("category_id", categoryId);
  } else {
    formData.append(
      "new_category_name",
      newCategoryName.trim()
    );
  }

  const response = await api.post(
    "/custom-designs",
    formData
  );

  return response.data;
};

// =====================================================
// BULK UPLOAD USING EXISTING SINGLE UPLOAD ENDPOINT
// =====================================================

export const createBulkCustomDesigns = async ({
  dresses,
  categoryMode,
  categoryId,
  newCategoryName,
  onProgress,
}) => {
  if (!Array.isArray(dresses) || !dresses.length) {
    throw new Error("Select at least one dress image.");
  }

  if (!["existing", "new"].includes(categoryMode)) {
    throw new Error("Select a valid category option.");
  }

  if (categoryMode === "existing" && !categoryId) {
    throw new Error("Select an existing category.");
  }

  if (
    categoryMode === "new" &&
    !newCategoryName?.trim()
  ) {
    throw new Error("Enter a new category name.");
  }

  const uploaded = [];
  const failed = [];

  let resolvedCategoryId =
    categoryMode === "existing" ? categoryId : null;

  let completed = 0;

  for (const dress of dresses) {
    try {
      if (!dress.file || !dress.name?.trim()) {
        throw new Error(
          "Image and dress name are required."
        );
      }

      const design = await createCustomDesign({
        file: dress.file,
        name: dress.name,
        categoryMode: resolvedCategoryId
          ? "existing"
          : "new",
        categoryId: resolvedCategoryId || "",
        newCategoryName,
      });

      if (!design?.id || !design?.category_id) {
        throw new Error(
          "Backend returned an incomplete design response."
        );
      }

      resolvedCategoryId = design.category_id;

      uploaded.push({
        ...dress,
        design,
      });
    } catch (error) {
      const detail = error.response?.data?.detail;

      failed.push({
        ...dress,
        error:
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
            ? detail.map((item) => item.msg).join(", ")
            : error.message || "Upload failed.",
      });

      if (!resolvedCategoryId && categoryMode === "new") {
        completed += 1;

        onProgress?.({
          completed,
          total: dresses.length,
          uploaded: uploaded.length,
          failed: failed.length,
          currentName: dress.name,
        });

        failed.push(
          ...dresses.slice(completed).map((item) => ({
            ...item,
            error: "Not attempted; category creation failed.",
          }))
        );

        break;
      }
    }

    completed += 1;

    onProgress?.({
      completed,
      total: dresses.length,
      uploaded: uploaded.length,
      failed: failed.length,
      currentName: dress.name,
    });
  }

  return {
    uploaded,
    failed,
    categoryId: resolvedCategoryId,
  };
};

// =====================================================
// PERMANENT DESIGN AI GENERATION
// =====================================================

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

  const images = { front, left, right, back };

  const missing = Object.entries(images)
    .filter(([, file]) => !file)
    .map(([view]) => view);

  if (missing.length) {
    throw new Error(
      `Missing customer images: ${missing.join(", ")}`
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

// =====================================================
// TEMPORARY AI GENERATION
// =====================================================

export const createTemporaryGeneration = async ({
  dress,
  front,
  left,
  right,
  back,
}) => {
  const images = {
    dress,
    front,
    left,
    right,
    back,
  };

  const missing = Object.entries(images)
    .filter(([, file]) => !file)
    .map(([field]) => field);

  if (missing.length) {
    throw new Error(
      `Missing images: ${missing.join(", ")}`
    );
  }

  const formData = new FormData();

  Object.entries(images).forEach(([name, file]) => {
    formData.append(name, file);
  });

  const response = await api.post(
    "/temporary-generation/create",
    formData
  );

  return response.data;
};

// =====================================================
// GENERATION STATUS
// =====================================================

export const getGeneration = async (jobId) => {
  if (!jobId) {
    throw new Error("Generation job ID is missing.");
  }

  const isTemporary = jobId.startsWith("temp_");

  const endpoint = isTemporary
    ? `/temporary-generation/${encodeURIComponent(jobId)}`
    : `/generation/${encodeURIComponent(jobId)}`;

  const response = await api.get(endpoint);

  return response.data;
};

// =====================================================
// COLLECTION ADMINISTRATOR LOGIN
// =====================================================

// No password or token is hardcoded.
// React passes credentials entered by the administrator.

export const loginCollectionAdmin = async ({
  username,
  password,
}) => {
  if (!username?.trim() || !password) {
    throw new Error(
      "Administrator username and password are required."
    );
  }

  const response = await api.post(
    "/designs/management/login",
    {
      username: username.trim(),
      password,
    }
  );

  if (!response.data?.access_token) {
    throw new Error(
      "Login succeeded but no access token was returned."
    );
  }

  return response.data;
};

// =====================================================
// AUTHENTICATED MOVE TO TRASH
// =====================================================

export const moveDesignToTrash = async ({
  designId,
  accessToken,
}) => {
  if (!designId) {
    throw new Error("Design ID is required.");
  }

  if (!accessToken) {
    throw new Error(
      "Administrator session has expired. Please log in."
    );
  }

  const response = await api.post(
    `/designs/${encodeURIComponent(designId)}/trash`,
    null,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.data;
};

// =====================================================
// MULTIPLE DRESSES TO TRASH
// =====================================================

// Calls the existing protected endpoint sequentially.
// Returns successful and failed records separately.

export const moveMultipleDesignsToTrash = async ({
  designs,
  accessToken,
  onProgress,
}) => {
  if (!Array.isArray(designs) || !designs.length) {
    throw new Error("Select at least one dress.");
  }

  if (!accessToken) {
    throw new Error(
      "Administrator authentication is required."
    );
  }

  const successful = [];
  const failed = [];

  for (const design of designs) {
    try {
      const result = await moveDesignToTrash({
        designId: design.id,
        accessToken,
      });

      if (result?.success !== true) {
        throw new Error(
          "Backend did not confirm the Trash operation."
        );
      }

      successful.push({
        design,
        result,
      });
    } catch (error) {
      const detail = error.response?.data?.detail;

      failed.push({
        design,
        error:
          typeof detail === "string"
            ? detail
            : error.message || "Unable to move dress to Trash.",
      });

      // Do not continue issuing protected mutations
      // when the administrator's token is invalid.
      if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
        onProgress?.({
          completed: successful.length + failed.length,
          total: designs.length,
          successful: successful.length,
          failed: failed.length,
        });

        for (const remaining of designs.slice(
          successful.length + failed.length
        )) {
          failed.push({
            design: remaining,
            error: "Not attempted because authentication failed.",
          });
        }

        break;
      }
    }

    onProgress?.({
      completed: successful.length + failed.length,
      total: designs.length,
      successful: successful.length,
      failed: failed.length,
    });
  }

  return {
    successful,
    failed,
    authExpired: failed.some((item) =>
      /authentication|credentials|token|unauthorized/i.test(
        item.error
      )
    ),
  };
};

export const deleteEmptyCategory = async ({
  categoryId,
  accessToken,
}) => {
  if (!categoryId || !accessToken) {
    throw new Error(
      "Category ID and administrator session are required."
    );
  }

  const response = await api.delete(
    `/categories/${encodeURIComponent(categoryId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.data;
};
