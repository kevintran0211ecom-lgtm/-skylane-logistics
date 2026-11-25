-- Tên bảng kê "{Tên KH} - {Mã KH} - {Mã bảng kê}" + bộ đếm số chứng từ theo ngày (SKLddMMyyXXXX)
ALTER TABLE statements ADD COLUMN name TEXT NOT NULL DEFAULT '';
CREATE TABLE doc_counters (
  prefix   TEXT NOT NULL,
  day      DATE NOT NULL,
  last_no  INT  NOT NULL,
  PRIMARY KEY (prefix, day)
);
ALTER TABLE doc_counters ENABLE ROW LEVEL SECURITY;
