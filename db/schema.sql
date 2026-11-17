-- =============================================================================
-- Deck Test Tuesday (DTT) - Rules of Villainy
-- PostgreSQL Schema & Data Retention Migration Script
-- Compatible with Neon, Supabase, and Render PostgreSQL Free Tiers
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES (Idempotent Creation)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE episode_format_tag AS ENUM ('Competitive', 'Core', 'Infinity', 'Coconut', 'Limited', 'Other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_format_type AS ENUM ('Bo1', 'Bo3', 'Bo5');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_winner_type AS ENUM ('Andy', 'Kirsten', 'Draw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE submission_type_enum AS ENUM ('link', 'full_list');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE submission_format_enum AS ENUM ('Core', 'Infinity', 'Coconut', 'Other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE submission_status_enum AS ENUM ('Pending', 'Approved', 'Played', 'Archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- episodes: Tracks weekly Deck Test Tuesday broadcasts & VODs
CREATE TABLE IF NOT EXISTS episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_video_id TEXT UNIQUE,
    title TEXT NOT NULL,
    episode_number INTEGER,
    stream_date DATE NOT NULL DEFAULT CURRENT_DATE,
    vod_url TEXT NOT NULL DEFAULT '',
    is_live BOOLEAN NOT NULL DEFAULT FALSE,
    is_upcoming BOOLEAN NOT NULL DEFAULT FALSE,
    is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
    set_name TEXT NOT NULL DEFAULT 'Core',
    format_tag episode_format_tag NOT NULL DEFAULT 'Core',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure newly added columns exist if table was already created
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_upcoming BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS set_name TEXT NOT NULL DEFAULT 'Core';

-- cards_cache: Local DB cache of Lorcast API lookups to eliminate rate limits
CREATE TABLE IF NOT EXISTS cards_cache (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    ink TEXT NOT NULL DEFAULT 'Amber',
    cost INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'Character',
    inkwell BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- decks: Global deck repository managed by Andy & Kirsten
CREATE TABLE IF NOT EXISTS decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
    pilot TEXT,
    built_by TEXT,
    deck_name TEXT NOT NULL,
    ink_one TEXT NOT NULL,
    ink_two TEXT NOT NULL,
    deck_link TEXT,
    notes TEXT,
    raw_decklist TEXT NOT NULL DEFAULT '',
    parsed_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT decks_pilot_check CHECK (pilot IS NULL OR pilot IN ('Andy', 'Kirsten', 'Community Sub', 'Unassigned'))
);

ALTER TABLE decks ADD COLUMN IF NOT EXISTS built_by TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- episode_decks: Many-to-many junction table (a deck can be assigned to multiple streams)
CREATE TABLE IF NOT EXISTS episode_decks (
    episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (episode_id, deck_id)
);

-- matches: Head-to-head match series and game-by-game results
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    andy_deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    kirsten_deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    match_format match_format_type NOT NULL DEFAULT 'Bo3',
    andy_score INTEGER NOT NULL DEFAULT 0,
    kirsten_score INTEGER NOT NULL DEFAULT 0,
    winner match_winner_type,
    game_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- deck_submissions: Community-submitted decklists for upcoming Tuesday streams
CREATE TABLE IF NOT EXISTS deck_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_name TEXT NOT NULL,
    submitter_name TEXT NOT NULL,
    ink_one TEXT NOT NULL,
    ink_two TEXT NOT NULL,
    submission_type submission_type_enum NOT NULL DEFAULT 'full_list',
    deck_link TEXT,
    raw_decklist TEXT,
    parsed_cards JSONB,
    format_category submission_format_enum NOT NULL DEFAULT 'Core',
    notes TEXT,
    status submission_status_enum NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- excluded_youtube_streams: Tracks YouTube streams that admin explicitly excluded from import
CREATE TABLE IF NOT EXISTS excluded_youtube_streams (
    youtube_video_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    published_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- app_settings: Key-value configuration store for live match state & admin settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_episodes_stream_date ON episodes(stream_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_is_live ON episodes(is_live) WHERE is_live = TRUE;
CREATE INDEX IF NOT EXISTS idx_episodes_is_hidden ON episodes(is_hidden);
CREATE INDEX IF NOT EXISTS idx_episodes_set_name ON episodes(set_name);
CREATE INDEX IF NOT EXISTS idx_cards_cache_lookup ON cards_cache(LOWER(name), LOWER(version));
CREATE INDEX IF NOT EXISTS idx_decks_pilot ON decks(pilot);
CREATE INDEX IF NOT EXISTS idx_episode_decks_ep ON episode_decks(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_decks_deck ON episode_decks(deck_id);
CREATE INDEX IF NOT EXISTS idx_matches_episode_id ON matches(episode_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON deck_submissions(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. 90-DAY DATA RETENTION UTILITY (Free Tier Safe)
-- Deletes processed (Approved, Played, Archived) submissions older than 90 days
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_old_deck_submissions(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM deck_submissions
        WHERE status IN ('Approved', 'Played', 'Archived')
          AND created_at < (NOW() - make_interval(days => retention_days))
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) - Hardening for Supabase
-- Blocks public PostgREST HTTP access from anon and authenticated roles.
-- The Next.js server connects as the database owner ('postgres') which bypasses RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS episode_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deck_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cards_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS excluded_youtube_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
