-- ═══════════════════════════════════════════════════
-- AFRIMARKET — PostgreSQL Schema
-- ═══════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  phone_verified BOOLEAN DEFAULT FALSE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'seller', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── OTP Codes ───
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON otp_codes(phone, used, expires_at);

-- ─── Sellers ───
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Shop info
  shop_name VARCHAR(100) NOT NULL,
  shop_slug VARCHAR(100) UNIQUE NOT NULL,
  shop_description TEXT,
  seller_type VARCHAR(20) NOT NULL CHECK (seller_type IN ('physical', 'digital')),

  -- KYC Documents
  doc_type VARCHAR(20) CHECK (doc_type IN ('cni', 'passport')),
  doc_recto_url TEXT,
  doc_verso_url TEXT,
  selfie_url TEXT,

  -- Mobile Money
  momo_provider VARCHAR(30),
  momo_number VARCHAR(20),
  momo_name VARCHAR(100),
  momo_verified BOOLEAN DEFAULT FALSE,

  -- Delivery (JSON array)
  delivery_methods JSONB DEFAULT '[]',
  pickup_address TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason TEXT,
  application_id VARCHAR(20) UNIQUE,

  -- Financial
  available_balance BIGINT DEFAULT 0, -- in FCFA centimes
  pending_balance BIGINT DEFAULT 0,
  total_withdrawn BIGINT DEFAULT 0,

  -- Timestamps
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seller_slug ON sellers(shop_slug);
CREATE INDEX idx_seller_status ON sellers(status);

-- ─── Categories ───
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(10),
  parent_id UUID REFERENCES categories(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Products ───
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  price BIGINT NOT NULL, -- FCFA (integer)
  original_price BIGINT,
  stock INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  seller_type VARCHAR(20) CHECK (seller_type IN ('physical', 'digital')),

  -- Images (JSON array of URLs)
  images JSONB DEFAULT '[]',

  -- Variants (JSON)
  variants JSONB DEFAULT '[]',
  -- Example: [{"name":"Taille","options":["S","M","L"]},{"name":"Couleur","options":["Rouge","Bleu"]}]

  -- Digital product fields
  download_url TEXT,
  download_limit INT,

  -- Stats
  view_count INT DEFAULT 0,
  order_count INT DEFAULT 0,

  -- Rating
  avg_rating DECIMAL(2,1) DEFAULT 0,
  review_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_seller ON products(seller_id);
CREATE INDEX idx_product_category ON products(category_id);
CREATE INDEX idx_product_active ON products(is_active);
CREATE INDEX idx_product_price ON products(price);

-- ─── Orders ───
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES sellers(id),
  product_id UUID REFERENCES products(id),

  quantity INT DEFAULT 1,
  unit_price BIGINT NOT NULL,
  total_amount BIGINT NOT NULL,
  variants_selected JSONB DEFAULT '{}',

  -- Customer info (may not have account)
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20),
  customer_address TEXT,

  -- Payment
  payment_method VARCHAR(30),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_reference VARCHAR(100),

  -- Order status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded')),

  -- Delivery
  delivery_method VARCHAR(30),
  tracking_number VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_seller ON orders(seller_id);
CREATE INDEX idx_order_buyer ON orders(buyer_id);
CREATE INDEX idx_order_status ON orders(status);

-- ─── Reviews ───
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  author VARCHAR(100),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_product ON reviews(product_id);

-- ─── Transactions (seller payouts) ───
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES sellers(id),
  order_id UUID REFERENCES orders(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  amount BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  reference VARCHAR(100),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_txn_seller ON transactions(seller_id);

-- ─── Seed categories ───
INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Mode & Vêtements', 'mode', '👗', 1),
  ('Électronique', 'electronique', '📱', 2),
  ('Maison & Déco', 'maison', '🏠', 3),
  ('Beauté & Santé', 'beaute', '🌿', 4),
  ('Livres & Formations', 'livres', '📚', 5),
  ('Art & Artisanat', 'art', '🎨', 6),
  ('Alimentation', 'alimentation', '🍲', 7),
  ('Services & Digital', 'digital', '💻', 8)
ON CONFLICT (slug) DO NOTHING;