import { create } from 'zustand'

const STORAGE_KEY = 'fresnel_ai_provider'

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSettings(settings) {
  try {
    if (!settings || settings.source === 'default') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  } catch { /* ignore quota errors */ }
}

const stored = loadSettings()

export const useProviderStore = create((set, get) => ({
  source: stored?.source || 'default',
  provider: stored?.provider || 'anthropic',
  model: stored?.model || '',
  apiKey: stored?.apiKey || '',

  setSource: (source) => {
    set({ source })
    saveSettings({ ...get(), source })
  },

  setProvider: (provider) => {
    set({ provider, model: '' })
    saveSettings({ ...get(), provider, model: '' })
  },

  setModel: (model) => {
    set({ model })
    saveSettings({ ...get(), model })
  },

  setApiKey: (apiKey) => {
    set({ apiKey })
    saveSettings({ ...get(), apiKey })
  },

  reset: () => {
    set({ source: 'default', provider: 'anthropic', model: '', apiKey: '' })
    localStorage.removeItem(STORAGE_KEY)
  },

  isByok: () => get().source === 'byok' && !!get().apiKey,

  getHeaders: () => {
    const { source, provider, apiKey, model } = get()
    if (source !== 'byok' || !apiKey) return {}
    const headers = {
      'X-AI-Provider': provider,
      'X-AI-API-Key': apiKey,
    }
    if (model) headers['X-AI-Model'] = model
    return headers
  },
}))
