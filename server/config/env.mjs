export const env = {
  port: Number(process.env.API_PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  twelveDataKey: process.env.TWELVE_DATA_API_KEY || '',
  groqKey: process.env.GROQ_API_KEY || '',
}
