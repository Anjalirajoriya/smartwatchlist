import { auth } from '../firebase'

export const API_BASE = import.meta.env.VITE_API_URL || ''

async function headers() {
  const user = auth?.currentUser
  return { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : { 'X-Demo-User': 'demo-user' }) }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...(await headers()), ...init.headers } })
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Request failed (${response.status})`) }
  if (response.status === 204) return undefined as T
  return response.json()
}