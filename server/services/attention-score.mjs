/** Deterministic and explainable; intentionally not an opaque ML score. */
export function attentionScore(percentMove, evidenceConfidence = 0, freshness = 100) {
  const abnormalMovement = Math.min(100, Math.abs(percentMove) * 20)
  return Math.round(0.4 * abnormalMovement + 0.25 * abnormalMovement + 0.2 * evidenceConfidence + 0.15 * freshness)
}
