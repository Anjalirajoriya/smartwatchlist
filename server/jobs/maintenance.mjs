/** Run by cron in production: node --env-file=.env server/jobs/maintenance.mjs */
import pg from 'pg'
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const result = await db.query(`DELETE FROM watchlist_items WHERE removed_at < now() - interval '30 days'`)
console.log(`Purged ${result.rowCount} expired soft-deleted watchlist relationships.`)
await db.end()
