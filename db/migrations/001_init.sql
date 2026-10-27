-- ShiftChange schema. Times are stored as the restaurant's local date and clock times,
-- since every location works in a single time zone.

CREATE TABLE locations (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  time_zone          text NOT NULL DEFAULT 'America/Vancouver',
  approval_required  boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             serial PRIMARY KEY,
  location_id    integer NOT NULL REFERENCES locations(id),
  name           text NOT NULL,
  email          text NOT NULL,
  role           text NOT NULL,
  is_manager     boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  password_hash  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz
);
-- One live account per email; a removed person can be invited again later.
CREATE UNIQUE INDEX users_email_live ON users (lower(email)) WHERE status <> 'removed';

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Single-use links for invites and password resets.
CREATE TABLE user_tokens (
  token_hash  text PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE login_attempts (
  id          serial PRIMARY KEY,
  email       text NOT NULL,
  succeeded   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email ON login_attempts (lower(email), created_at);

-- A shift someone wants to give away or swap. poster_id is null when a manager posts
-- a shift that needs cover.
CREATE TABLE posts (
  id           serial PRIMARY KEY,
  location_id  integer NOT NULL REFERENCES locations(id),
  poster_id    integer REFERENCES users(id),
  created_by   integer NOT NULL REFERENCES users(id),
  shift_date   date NOT NULL,
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  role         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('giveaway', 'swap')),
  audience     text NOT NULL CHECK (audience IN ('everyone', 'selected')),
  note         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'done', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_location_status ON posts (location_id, status, shift_date);

-- The teammates a post was sent to when it isn't for everyone.
CREATE TABLE post_recipients (
  post_id      integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      integer NOT NULL REFERENCES users(id),
  declined_at  timestamptz,
  PRIMARY KEY (post_id, user_id)
);

-- Someone offering to take a post's shift, either outright or in exchange for one of theirs.
CREATE TABLE offers (
  id                serial PRIMARY KEY,
  post_id           integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  from_id           integer NOT NULL REFERENCES users(id),
  kind              text NOT NULL CHECK (kind IN ('pickup', 'swap')),
  swap_date         date,
  swap_start        time,
  swap_end          time,
  swap_role         text,
  status            text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'accepted', 'declined', 'withdrawn', 'approved', 'denied')),
  needs_approval    boolean NOT NULL DEFAULT false,
  decided_by        integer REFERENCES users(id),
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'pickup' OR (swap_date IS NOT NULL AND swap_start IS NOT NULL AND swap_end IS NOT NULL AND swap_role IS NOT NULL))
);
CREATE INDEX offers_post ON offers (post_id, status);

CREATE TABLE activity (
  id           serial PRIMARY KEY,
  location_id  integer NOT NULL REFERENCES locations(id),
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_location ON activity (location_id, created_at DESC);
