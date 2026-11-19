CREATE EXTENSION IF NOT EXISTS "pgcrypto";


CREATE TABLE IF NOT EXISTS categories (

    id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,

    slug VARCHAR(150)
    UNIQUE NOT NULL,

    display_order INTEGER
    DEFAULT 0,

    created_at TIMESTAMPTZ
    DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS designs (

    id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

    category_id UUID
    NOT NULL
    REFERENCES categories(id)
    ON DELETE CASCADE,

    design_code VARCHAR(100)
    UNIQUE NOT NULL,

    name VARCHAR(200)
    NOT NULL,

    description TEXT,

    image_url TEXT
    NOT NULL,

    is_active BOOLEAN
    DEFAULT TRUE,

    created_at TIMESTAMPTZ
    DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS generation_jobs (

    id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

    design_id UUID
    NOT NULL
    REFERENCES designs(id),

    front_image_url TEXT
    NOT NULL,

    left_image_url TEXT
    NOT NULL,

    right_image_url TEXT
    NOT NULL,

    back_image_url TEXT,

    status VARCHAR(50)
    DEFAULT 'pending',

    progress INTEGER
    DEFAULT 0,

    output_front_url TEXT,

    output_left_url TEXT,

    output_right_url TEXT,

    output_back_url TEXT,

    error_message TEXT,

    created_at TIMESTAMPTZ
    DEFAULT NOW(),

    completed_at TIMESTAMPTZ
);