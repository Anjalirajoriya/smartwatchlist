CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  preferences JSONB NOT NULL DEFAULT '{"theme":"light","notify_push":true,"notify_email":false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  exchange TEXT,
  sector TEXT,
  industry TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  UNIQUE(user_id, stock_id)
);
CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  price NUMERIC(14,4) NOT NULL,
  change_percent NUMERIC(10,4),
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_snapshot_latest ON price_snapshots(stock_id, timestamp DESC);
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  importance SMALLINT NOT NULL CHECK (importance BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'DETECTED',
  explanation TEXT,
  explanation_generated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS event_feed ON events(stock_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS event_archive ON events(archived_at, timestamp DESC);
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_url TEXT,
  published_at TIMESTAMPTZ,
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS user_event_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  PRIMARY KEY(user_id, event_id)
);
CREATE TABLE IF NOT EXISTS event_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL DEFAULT 'default',
  question_text TEXT,
  answer TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, question_type)
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'IN_APP',
  status TEXT NOT NULL DEFAULT 'UNREAD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE(user_id, event_id, type)
);
CREATE INDEX IF NOT EXISTS notification_inbox ON notifications(user_id, status, created_at DESC);
