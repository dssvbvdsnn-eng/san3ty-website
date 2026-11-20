-- SAN3TY craftspeople directory
-- Run this file once in your Cloudflare D1 database.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artisans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT NOT NULL CHECK (trade IN (
    'plumbing',
    'electrical',
    'air_conditioning',
    'carpentry',
    'painting',
    'appliance_repair',
    'water_heater',
    'general_maintenance'
  )),
  governorate TEXT NOT NULL,
  district TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  completed_jobs INTEGER NOT NULL DEFAULT 0 CHECK (completed_jobs >= 0),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('available', 'busy', 'unknown')),
  bio TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artisan_service_areas (
  artisan_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  PRIMARY KEY (artisan_id, area_name),
  FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artisans_trade_verified
  ON artisans (trade, is_verified, is_active);

CREATE INDEX IF NOT EXISTS idx_artisans_governorate_district
  ON artisans (governorate, district);

CREATE INDEX IF NOT EXISTS idx_service_areas_name
  ON artisan_service_areas (area_name);

-- Add only real artisans after verifying their identity and contact details.
-- Supported trade codes:
-- plumbing, electrical, air_conditioning, carpentry, painting,
-- appliance_repair, water_heater, general_maintenance
