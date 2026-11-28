-- U-59 파산 소식(「오늘 망한 자들」). 시세로 검증하지 않는 재미용 줄
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  name TEXT NOT NULL,
  cause TEXT NOT NULL,           -- liq | interest | overdue | noLender
  coin TEXT, dir INTEGER, lev INTEGER,
  loss REAL NOT NULL, peak REAL NOT NULL,
  ending TEXT,                   -- 라이트 엔딩 제목
  lite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_at ON events (created_at DESC);
CREATE TABLE IF NOT EXISTS event_submits (
  device TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
