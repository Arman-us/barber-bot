CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  tg_username TEXT,
  client_name TEXT,
  client_phone TEXT,
  booking_datetime TIMESTAMP NOT NULL,
  sheet_name TEXT NOT NULL, -- лист в Google Sheets, e.g. '25.02.2025'
  is_canceled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_tg_username_future 
  ON bookings (tg_username, booking_datetime);