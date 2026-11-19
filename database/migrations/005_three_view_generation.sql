-- FashionFit V5: Three-view image generation.
-- Preserve existing V4.1 photographs and generation history.
-- Allow new generation requests without a back photograph.

ALTER TABLE public.generation_jobs
    ALTER COLUMN back_image_url DROP NOT NULL;
