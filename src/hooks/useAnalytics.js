import mixpanel from 'mixpanel-browser'

const MIXPANEL_TOKEN = 'd0150ef1b0448f98628e6a57401437f0'
const isDev = import.meta.env.DEV

let initialized = false

/**
 * Initialize Mixpanel once.
 * Called at app startup.
 */
export function initAnalytics() {
  if (initialized || isDev) return
  mixpanel.init(MIXPANEL_TOKEN, {
    debug: false,
    track_pageview: false, // we track page views manually
    persistence: 'localStorage',
  })
  initialized = true
}

/**
 * Identify the current user and set their profile properties.
 * Called after authentication with the GitHub user object.
 * We intentionally do NOT store the PAT.
 */
export function identifyUser(user) {
  if (!user || isDev) return
  mixpanel.identify(user.id?.toString())
  mixpanel.people.set({
    $email: user.email || undefined,
    $name: user.name || user.login,
    $avatar: user.avatar_url,
    github_login: user.login,
    github_id: user.id,
    company: user.company || undefined,
    bio: user.bio || undefined,
    location: user.location || undefined,
  })
  mixpanel.register({
    sourceProject: 'fresnel',
    app_type: typeof window !== 'undefined' && window.electronAPI?.isElectron ? 'electron' : 'web',
    platform: navigator.platform,
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    locale: navigator.language,
  })
  mixpanel.people.set_once('first_seen', new Date().toISOString())
}

/**
 * Reset analytics on logout.
 */
export function resetAnalytics() {
  if (isDev) return
  mixpanel.reset()
}

/**
 * Track an event with optional properties.
 */
export function trackEvent(eventName, properties = {}) {
  if (isDev) return
  mixpanel.track(eventName, properties)
}
