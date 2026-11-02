CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  owner text NOT NULL,
  email text NOT NULL,
  clerk_user_id text,
  tint text NOT NULL,
  agents integer NOT NULL,
  online integer NOT NULL,
  tasks integer NOT NULL,
  last_active text NOT NULL,
  created_week integer NOT NULL,
  mission text NOT NULL,
  sort_order integer NOT NULL,
  CHECK (account_id = id)
);

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly integer NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  account_id text PRIMARY KEY REFERENCES accounts (id),
  plan text NOT NULL,
  status text NOT NULL,
  mrr integer NOT NULL,
  ltv integer NOT NULL,
  started text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS squads (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS masters (
  account_id text PRIMARY KEY REFERENCES accounts (id),
  name text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  tint text NOT NULL,
  is_on boolean NOT NULL,
  autonomy text NOT NULL,
  mission text NOT NULL,
  contribution integer NOT NULL,
  tasks integer NOT NULL,
  success text NOT NULL,
  saved text NOT NULL,
  last_text text NOT NULL,
  targets jsonb NOT NULL,
  kpis jsonb NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS machines (
  account_id text NOT NULL,
  agent_id text NOT NULL,
  host text NOT NULL,
  region text NOT NULL,
  size text NOT NULL,
  cpu text NOT NULL,
  uptime text NOT NULL,
  egress jsonb NOT NULL,
  secrets jsonb NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, agent_id),
  FOREIGN KEY (account_id, agent_id) REFERENCES agents (account_id, id)
);

CREATE TABLE IF NOT EXISTS skills (
  account_id text NOT NULL,
  agent_id text NOT NULL,
  id text NOT NULL,
  description text NOT NULL,
  gate text NOT NULL,
  runs integer NOT NULL,
  is_on boolean NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, agent_id, id),
  FOREIGN KEY (account_id, agent_id) REFERENCES agents (account_id, id)
);

CREATE TABLE IF NOT EXISTS bus_events (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  time_text text NOT NULL,
  from_agent text NOT NULL,
  to_agent text NOT NULL,
  kind text NOT NULL,
  skill text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL,
  writes jsonb NOT NULL,
  trace text NOT NULL,
  seq integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS state_entries (
  account_id text NOT NULL REFERENCES accounts (id),
  key text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, key)
);

CREATE TABLE IF NOT EXISTS rules (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  rule_when text NOT NULL,
  agent text NOT NULL,
  action text NOT NULL,
  approval text NOT NULL,
  is_on boolean NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS approvals (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  agent text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  amount text NOT NULL,
  status text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS mission_proposals (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  agent text NOT NULL,
  mission text NOT NULL,
  targets jsonb NOT NULL,
  status text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS daily_revenue (
  account_id text NOT NULL REFERENCES accounts (id),
  day text NOT NULL,
  amount integer NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS overview_tiles (
  account_id text PRIMARY KEY REFERENCES accounts (id),
  tiles jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  account_id text NOT NULL REFERENCES accounts (id),
  id text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS messages (
  account_id text NOT NULL,
  thread_id text NOT NULL,
  id text NOT NULL,
  from_role text NOT NULL,
  agent text,
  body text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, thread_id) REFERENCES threads (account_id, id)
);

CREATE TABLE IF NOT EXISTS agent_images (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  tint text NOT NULL,
  tag text NOT NULL,
  version text NOT NULL,
  next_version text NOT NULL,
  updated text NOT NULL,
  updated_full text NOT NULL,
  deployed integer NOT NULL,
  on_latest integer NOT NULL,
  status text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS bugs (
  id text PRIMARY KEY,
  image_id text NOT NULL REFERENCES agent_images (id),
  sev text NOT NULL,
  title text NOT NULL,
  age text NOT NULL,
  reports integer NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_requests (
  id text PRIMARY KEY,
  image_id text NOT NULL REFERENCES agent_images (id),
  title text NOT NULL,
  votes integer NOT NULL,
  stage text NOT NULL,
  sort_order integer NOT NULL
);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE squads ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE bus_events ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
ALTER TABLE bus_events ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;
ALTER TABLE state_entries ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE state_entries ALTER COLUMN value TYPE text USING value::text;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE mission_proposals ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE agent_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE feature_requests ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS clerk_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_clerk_user_id_key ON accounts (clerk_user_id);

CREATE TABLE IF NOT EXISTS bus_cursors (
  account_id text PRIMARY KEY REFERENCES accounts (id),
  seq integer NOT NULL,
  clock integer NOT NULL,
  script_index integer NOT NULL
);

INSERT INTO threads (account_id, id, sort_order)
SELECT account_id, 'dock', 0 FROM (
  SELECT account_id FROM threads WHERE id = 'main'
  UNION
  SELECT account_id FROM messages WHERE thread_id = 'main'
) AS main_rows
WHERE NOT EXISTS (
  SELECT 1 FROM threads AS existing
  WHERE existing.account_id = main_rows.account_id AND existing.id = 'dock'
);

UPDATE messages SET thread_id = 'dock' WHERE thread_id = 'main';

DELETE FROM threads WHERE id = 'main';
