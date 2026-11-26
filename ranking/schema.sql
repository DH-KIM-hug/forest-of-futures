-- 선물의 숲 랭킹: 판마다 기기당 최고 기록 한 줄.
CREATE TABLE IF NOT EXISTS scores (
  board TEXT NOT NULL,           -- networth | roe | pnl
  device TEXT NOT NULL,          -- 익명 기기 번호(앱이 만든 무작위 값)
  name TEXT NOT NULL,            -- 닉네임(1~12자)
  value REAL NOT NULL,
  detail TEXT NOT NULL,          -- JSON: 거래 요약 또는 생 요약
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board, device)
);
CREATE INDEX IF NOT EXISTS scores_board_value ON scores (board, value DESC);
CREATE TABLE IF NOT EXISTS submits (
  device TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
