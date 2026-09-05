/**
 * Stores independently published, dated articles as evidence. A matching article
 * is correlation only: the UI must never state that it caused the price move.
 */
export function createEvidenceIngestion({ db, newsApiKey }) {
  async function findArticles(companyName) {
    if (!newsApiKey) return []
    const url = new URL('https://gnews.io/api/v4/search')
    url.search = new URLSearchParams({ q: companyName, lang: 'en', max: '5', apikey: newsApiKey })
    const response = await fetch(url)
    const data = await response.json()
    if (!response.ok || data.errors) throw new Error('News evidence provider is unavailable')
    return (data.articles || []).filter(article => article.url && article.publishedAt)
  }

  async function enrichEvent({ eventId, companyName }) {
    const articles = await findArticles(companyName)
    for (const article of articles) {
      await db.query(`INSERT INTO evidence(event_id,source,source_url,published_at,confidence)
        SELECT $1,$2,$3,$4,70 WHERE NOT EXISTS
        (SELECT 1 FROM evidence WHERE event_id=$1 AND source_url=$3)`,
      [eventId, article.source?.name || 'GNews', article.url, article.publishedAt])
    }
    if (articles.length) await db.query(`UPDATE events SET status='VERIFIED', description=$2 WHERE id=$1`, [eventId,
      `Recent coverage: “${articles[0].title}” (${articles[0].source?.name || 'GNews'}). It was published near this movement; the timing is evidence, not proof that it caused the move.`])
    return articles.length
  }
  return { enrichEvent }
}
