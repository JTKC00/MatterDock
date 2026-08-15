export type Migration = {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'foundation',
    sql: `
      CREATE TABLE organisations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE organisation_aliases (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (organisation_id, normalized_alias)
      );

      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        job_title TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE matters (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        organisation_id TEXT REFERENCES organisations(id) ON DELETE RESTRICT,
        reference TEXT,
        status TEXT NOT NULL CHECK (
          status IN ('new', 'in_progress', 'waiting', 'scheduled', 'completed', 'archived')
        ),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (
          priority IN ('low', 'normal', 'high', 'urgent')
        ),
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        archived_at TEXT
      );

      CREATE TABLE matter_contacts (
        matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
        role TEXT,
        PRIMARY KEY (matter_id, contact_id)
      );

      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE matter_tags (
        matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (matter_id, tag_id)
      );

      CREATE INDEX idx_matters_status ON matters(status);
      CREATE INDEX idx_matters_updated_at ON matters(updated_at DESC);
      CREATE INDEX idx_matters_organisation_id ON matters(organisation_id);
      CREATE INDEX idx_contacts_organisation_id ON contacts(organisation_id);
      CREATE INDEX idx_contacts_name ON contacts(name);
      CREATE INDEX idx_organisation_aliases_org ON organisation_aliases(organisation_id);
      CREATE INDEX idx_organisation_aliases_normalized ON organisation_aliases(normalized_alias);
      CREATE INDEX idx_organisations_name ON organisations(name);
      CREATE INDEX idx_matter_contacts_contact ON matter_contacts(contact_id);
      CREATE INDEX idx_matter_tags_tag ON matter_tags(tag_id);
    `
  },
  {
    version: 2,
    name: 'archive_previous_status',
    sql: `
      ALTER TABLE matters ADD COLUMN status_before_archive TEXT;

      UPDATE matters
      SET status_before_archive = CASE
        WHEN completed_at IS NOT NULL THEN 'completed'
        ELSE 'in_progress'
      END
      WHERE status = 'archived'
        AND status_before_archive IS NULL;
    `
  },
  {
    version: 3,
    name: 'matter_timeline',
    sql: `
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (
          type IN ('note', 'phone', 'email', 'whatsapp', 'meeting', 'letter')
        ),
        title TEXT,
        body TEXT,
        contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
        direction TEXT CHECK (
          direction IS NULL OR direction IN ('incoming', 'outgoing', 'internal')
        ),
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE event_email_details (
        event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        from_address TEXT,
        to_addresses TEXT,
        cc_addresses TEXT,
        subject TEXT
      );

      CREATE INDEX idx_events_matter_occurred ON events(matter_id, occurred_at DESC);
      CREATE INDEX idx_events_contact ON events(contact_id);
    `
  },
  {
    version: 4,
    name: 'tasks_waiting_next_action',
    sql: `
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('action', 'waiting')),
        title TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
        due_at TEXT,
        waiting_for_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
        waiting_for_text TEXT,
        waiting_since TEXT,
        is_next_action INTEGER NOT NULL DEFAULT 0 CHECK (is_next_action IN (0, 1)),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (
          priority IN ('low', 'normal', 'high', 'urgent')
        ),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_tasks_matter ON tasks(matter_id);
      CREATE INDEX idx_tasks_status ON tasks(status);
      CREATE INDEX idx_tasks_type ON tasks(type);
      CREATE INDEX idx_tasks_due_at ON tasks(due_at);
      CREATE INDEX idx_tasks_waiting_contact ON tasks(waiting_for_contact_id);
      CREATE UNIQUE INDEX idx_one_next_action_per_matter
        ON tasks(matter_id)
        WHERE is_next_action = 1 AND status = 'open';
    `
  }
]
