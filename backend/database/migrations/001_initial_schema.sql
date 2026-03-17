-- ============================================================
-- AfriMarket — Migration 001 : Schéma initial
-- backend/database/migrations/001_initial_schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Fonction auto-update updated_at ──────────────────────
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────
-- 1. USERS
-- ────────────────────────────────────────────────────────
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(20)  UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(20)  NOT NULL DEFAULT 'buyer'
                    CHECK (role IN ('buyer','seller','admin','moderator')),
  status            VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','suspended','banned')),
  country_code      CHAR(2),
  email_verified    BOOLEAN DEFAULT FALSE,
  phone_verified    BOOLEAN DEFAULT FALSE,
  avatar_url        VARCHAR(500),
  last_login_at     TIMESTAMPTZ,
  login_attempts    INTEGER DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_users_email   ON users(email);
CREATE INDEX idx_users_phone   ON users(phone);
CREATE INDEX idx_users_role    ON users(role);
CREATE INDEX idx_users_status  ON users(status);

-- ────────────────────────────────────────────────────────
-- 2. CATEGORIES (avant stores)
-- ────────────────────────────────────────────────────────
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  emoji       VARCHAR(10),
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO categories (name, slug, emoji) VALUES
  ('Électronique',  'electronics', '📱'),
  ('Mode',          'fashion',     '👗'),
  ('Alimentation',  'food',        '🥗'),
  ('Beauté',        'beauty',      '💄'),
  ('Maison',        'home',        '🏠'),
  ('Santé',         'health',      '⚕️'),
  ('Automobile',    'auto',        '🚗'),
  ('Artisanat',     'crafts',      '🎨'),
  ('Enfants',       'kids',        '🧸'),
  ('Digital',       'digital',     '💻');

-- ────────────────────────────────────────────────────────
-- 3. STORES
-- ────────────────────────────────────────────────────────
CREATE TABLE stores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(80) NOT NULL,
  slug             VARCHAR(100) UNIQUE NOT NULL,
  description      TEXT,
  tagline          VARCHAR(120),
  logo_url         VARCHAR(500),
  banner_url       VARCHAR(500),
  banner_color     VARCHAR(20) DEFAULT '#1A5C35',
  primary_color    VARCHAR(20) DEFAULT '#1A5C35',
  whatsapp_number  VARCHAR(25),
  status           VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending','active','suspended','rejected')),
  rejection_reason TEXT,
  country_code     CHAR(2),
  category_id      UUID REFERENCES categories(id),
  store_type       VARCHAR(20) DEFAULT 'physical'
                   CHECK (store_type IN ('physical','digital','mixed')),
  is_verified      BOOLEAN DEFAULT FALSE,
  total_sales      INTEGER DEFAULT 0,
  total_revenue    BIGINT DEFAULT 0,
  rating           DECIMAL(3,2),
  total_reviews    INTEGER DEFAULT 0,
  view_count       INTEGER DEFAULT 0,
  follower_count   INTEGER DEFAULT 0,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_stores_seller   ON stores(seller_id);
CREATE INDEX idx_stores_slug     ON stores(slug);
CREATE INDEX idx_stores_status   ON stores(status);
CREATE INDEX idx_stores_category ON stores(category_id);

-- ────────────────────────────────────────────────────────
-- 4. SELLER KYC (dossiers de vérification)
-- ────────────────────────────────────────────────────────
CREATE TABLE seller_kyc (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_type       VARCHAR(20) NOT NULL CHECK (store_type IN ('physical','digital')),

  -- Documents identité (URLs chiffrées, accès privé)
  doc_type         VARCHAR(20) CHECK (doc_type IN ('cni','passport','residence')),
  doc_front_url    VARCHAR(500),  -- Stockage privé chiffré
  doc_back_url     VARCHAR(500),  -- NULL si passeport
  selfie_url       VARCHAR(500),

  -- Mobile Money vérifié
  mm_provider      VARCHAR(30) CHECK (mm_provider IN ('orange_money','wave','mtn_momo','moov_money')),
  mm_phone         VARCHAR(25),
  mm_account_name  VARCHAR(200),
  mm_verified      BOOLEAN DEFAULT FALSE,
  mm_verified_at   TIMESTAMPTZ,

  -- Livraison (tableau JSON)
  delivery_methods JSONB DEFAULT '[]',
  processing_time  VARCHAR(20) DEFAULT '1_day',

  -- Statut vérification
  status           VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending','in_review','approved','rejected','needs_more_info')),
  reviewer_id      UUID REFERENCES users(id),
  review_notes     TEXT,        -- Notes internes admin
  rejection_reason TEXT,        -- Motif communiqué au vendeur
  reviewed_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_kyc_user UNIQUE (user_id)
);
CREATE TRIGGER trg_kyc_updated_at BEFORE UPDATE ON seller_kyc FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_kyc_user    ON seller_kyc(user_id);
CREATE INDEX idx_kyc_status  ON seller_kyc(status);

-- ────────────────────────────────────────────────────────
-- 5. PRODUCTS
-- ────────────────────────────────────────────────────────
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  price           BIGINT NOT NULL CHECK (price > 0),    -- En FCFA centimes
  compare_price   BIGINT CHECK (compare_price > 0),
  cost_price      BIGINT,                               -- Privé, non exposé
  stock           INTEGER DEFAULT 0 CHECK (stock >= 0),
  sku             VARCHAR(100),
  product_type    VARCHAR(20) DEFAULT 'physical'
                  CHECK (product_type IN ('physical','digital')),
  status          VARCHAR(20) DEFAULT 'draft'
                  CHECK (status IN ('draft','active','paused','sold_out','rejected')),
  weight_grams    INTEGER,
  delivery_info   VARCHAR(300),
  digital_file_url VARCHAR(500),
  total_sales     INTEGER DEFAULT 0,
  view_count      INTEGER DEFAULT 0,
  rating          DECIMAL(3,2),
  total_reviews   INTEGER DEFAULT 0,
  is_featured     BOOLEAN DEFAULT FALSE,
  tags            TEXT[],
  search_vector   tsvector,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_products_store    ON products(store_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status   ON products(status);
CREATE INDEX idx_products_price    ON products(price);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_search   ON products USING GIN(search_vector);

-- Trigger mise à jour search_vector
CREATE OR REPLACE FUNCTION fn_products_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('french', COALESCE(NEW.name,'') || ' ' || COALESCE(NEW.description,''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_products_search BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fn_products_search_vector();

-- ────────────────────────────────────────────────────────
-- 6. PRODUCT IMAGES
-- ────────────────────────────────────────────────────────
CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  alt_text    VARCHAR(200),
  sort_order  INTEGER DEFAULT 0,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_product_images ON product_images(product_id);

-- ────────────────────────────────────────────────────────
-- 7. PRODUCT VARIANTS
-- ────────────────────────────────────────────────────────
CREATE TABLE product_variants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,   -- Ex: "Couleur", "Taille"
  values      JSONB NOT NULL,          -- Ex: ["Rouge","Bleu","Vert"]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_product_variants ON product_variants(product_id);

-- ────────────────────────────────────────────────────────
-- 8. ORDERS
-- ────────────────────────────────────────────────────────
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES users(id),
  store_id        UUID NOT NULL REFERENCES stores(id),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','disputed')),
  subtotal        BIGINT NOT NULL,
  shipping_fee    BIGINT DEFAULT 0,
  platform_fee    BIGINT DEFAULT 0,   -- 5% commission
  total           BIGINT NOT NULL,
  currency        CHAR(3) DEFAULT 'XOF',
  delivery_address JSONB,
  delivery_method VARCHAR(50),
  tracking_code   VARCHAR(100),
  notes           TEXT,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_store    ON orders(store_id);
CREATE INDEX idx_orders_status   ON orders(status);
CREATE INDEX idx_orders_created  ON orders(created_at DESC);

-- ────────────────────────────────────────────────────────
-- 9. ORDER ITEMS
-- ────────────────────────────────────────────────────────
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(200) NOT NULL,   -- Snapshot au moment de l'achat
  product_img  VARCHAR(500),
  variant_data JSONB,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   BIGINT NOT NULL,
  total        BIGINT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ────────────────────────────────────────────────────────
-- 10. PAYMENTS & ESCROW
-- ────────────────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  customer_id     UUID NOT NULL REFERENCES users(id),
  amount          BIGINT NOT NULL,
  currency        CHAR(3) DEFAULT 'XOF',
  provider        VARCHAR(30) NOT NULL,  -- orange_money, wave, mtn_momo, etc.
  provider_ref    VARCHAR(200),          -- Référence de la transaction chez le provider
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed','refunded')),
  provider_fee    BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX idx_payments_order    ON payments(order_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);

CREATE TABLE escrow (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  payment_id      UUID NOT NULL REFERENCES payments(id),
  seller_id       UUID NOT NULL REFERENCES users(id),
  gross_amount    BIGINT NOT NULL,       -- Montant brut
  platform_fee    BIGINT NOT NULL,       -- 5%
  net_amount      BIGINT NOT NULL,       -- Ce que reçoit le vendeur
  status          VARCHAR(20) DEFAULT 'held'
                  CHECK (status IN ('held','released','refunded','disputed')),
  held_at         TIMESTAMPTZ DEFAULT NOW(),
  released_at     TIMESTAMPTZ,
  dispute_reason  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_escrow_order  ON escrow(order_id);
CREATE INDEX idx_escrow_seller ON escrow(seller_id);
CREATE INDEX idx_escrow_status ON escrow(status);

-- ────────────────────────────────────────────────────────
-- 11. SELLER BALANCE (décaisssements)
-- ────────────────────────────────────────────────────────
CREATE TABLE seller_withdrawals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id    UUID NOT NULL REFERENCES users(id),
  amount       BIGINT NOT NULL CHECK (amount >= 1000),  -- Min 1000 FCFA
  mm_provider  VARCHAR(30) NOT NULL,
  mm_phone     VARCHAR(25) NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending'
               CHECK (status IN ('pending','processing','completed','failed')),
  provider_ref VARCHAR(200),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_withdrawals_seller ON seller_withdrawals(seller_id);

-- ────────────────────────────────────────────────────────
-- 12. REVIEWS
-- ────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reviewer_id     UUID NOT NULL REFERENCES users(id),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES stores(id)   ON DELETE CASCADE,
  order_id        UUID REFERENCES orders(id),
  review_type     VARCHAR(10) NOT NULL CHECK (review_type IN ('product','store')),
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           VARCHAR(200),
  body            TEXT,
  images          TEXT[],
  is_verified     BOOLEAN DEFAULT FALSE,  -- Achat vérifié
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','published','rejected')),
  helpful_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_review_target CHECK (
    (review_type = 'product' AND product_id IS NOT NULL AND store_id IS NULL) OR
    (review_type = 'store'   AND store_id   IS NOT NULL AND product_id IS NULL)
  ),
  CONSTRAINT uq_review_product UNIQUE (reviewer_id, product_id),
  CONSTRAINT uq_review_store   UNIQUE (reviewer_id, store_id)
);
CREATE INDEX idx_reviews_product ON reviews(product_id) WHERE review_type = 'product';
CREATE INDEX idx_reviews_store   ON reviews(store_id)   WHERE review_type = 'store';

-- ────────────────────────────────────────────────────────
-- 13. PANIER & WISHLIST
-- ────────────────────────────────────────────────────────
CREATE TABLE cart_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_data JSONB,
  quantity    INTEGER DEFAULT 1 CHECK (quantity > 0),
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_cart UNIQUE (user_id, product_id, (variant_data::text))
);
CREATE INDEX idx_cart_user ON cart_items(user_id);

CREATE TABLE wishlist_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- ────────────────────────────────────────────────────────
-- 14. FRAUD ALERTS
-- ────────────────────────────────────────────────────────
CREATE TABLE fraud_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  entity_type VARCHAR(20),
  entity_id   UUID,
  alert_type  VARCHAR(50) NOT NULL,
  risk_level  VARCHAR(10) CHECK (risk_level IN ('low','medium','high','critical')),
  details     JSONB,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fraud_unresolved ON fraud_alerts(is_resolved) WHERE is_resolved = FALSE;

-- ────────────────────────────────────────────────────────
-- 15. LOGS ACTIVITÉ
-- ────────────────────────────────────────────────────────
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  ip_address  INET,
  user_agent  VARCHAR(500),
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_logs_user    ON activity_logs(user_id);
CREATE INDEX idx_logs_action  ON activity_logs(action);
CREATE INDEX idx_logs_created ON activity_logs(created_at DESC);

-- ────────────────────────────────────────────────────────
-- 16. OTP TOKENS (phone verification)
-- ────────────────────────────────────────────────────────
CREATE TABLE otp_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(25) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  purpose     VARCHAR(30) DEFAULT 'phone_verify',
  attempts    INTEGER DEFAULT 0,
  is_used     BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_otp_phone   ON otp_tokens(phone, expires_at);

-- ────────────────────────────────────────────────────────
-- 17. STORE FOLLOWERS
-- ────────────────────────────────────────────────────────
CREATE TABLE store_followers (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, store_id)
);

-- ────────────────────────────────────────────────────────
-- 18. VUE COMPLÈTE PRODUITS
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_products_full AS
SELECT
  p.*,
  s.name          AS store_name,
  s.slug          AS store_slug,
  s.is_verified   AS store_verified,
  s.whatsapp_number AS store_whatsapp,
  s.logo_url      AS store_logo,
  c.name          AS category_name,
  c.slug          AS category_slug,
  c.emoji         AS category_emoji,
  pi.url          AS primary_image
FROM products p
LEFT JOIN stores    s  ON s.id = p.store_id
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
WHERE p.status = 'active' AND s.status = 'active';
