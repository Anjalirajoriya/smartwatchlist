import fs from 'node:fs/promises'
import pg from 'pg'
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Add it to .env first.')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } })
await client.connect()
await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
await client.query(await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ')
await client.end()
console.log('Database schema is ready.')
