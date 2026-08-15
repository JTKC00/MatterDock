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
  }
]
