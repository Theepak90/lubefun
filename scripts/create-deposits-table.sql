-- Create deposits table for SOL deposit tracking
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'SOL' NOT NULL,
  network TEXT DEFAULT 'mainnet',
  deposit_address TEXT NOT NULL,
  memo TEXT,
  status TEXT DEFAULT 'PENDING' NOT NULL,
  tx_hash TEXT,
  tx_amount DOUBLE PRECISION,
  confirmed_at TIMESTAMP,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

-- Create index on idempotency_key for uniqueness checks
CREATE INDEX IF NOT EXISTS idx_deposits_idempotency_key ON deposits(idempotency_key) WHERE idempotency_key IS NOT NULL;

