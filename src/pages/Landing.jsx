import { useState, useEffect, useRef, useCallback } from 'react'
import { trackEvent } from '../hooks/useAnalytics'
import '../landing.css'
import tahoeWallpaper from '../tahoe_wallpaper.jpg'
import dockImage from '../Dock.png'

const featureTabs = [
  { id: 0, label: 'Lenses', video: '/lens.mp4', tag: 'Saved Lenses', title: 'Lenses that remember', desc: 'Save custom review patterns. Flag useEffect anti-patterns, catch missing error handling, enforce conventions.' },
  { id: 1, label: 'Chat', video: '/vibe-check.mp4', tag: 'On-the-fly', title: 'Vibe-check any PR', desc: 'Quick ad-hoc reviews when you need a second opinion. "Will this break prod?" Instant answers.' },
  { id: 2, label: 'Submit', video: '/sends-to-github.mp4', tag: 'Human-in-the-loop', title: 'Actually good AI review', desc: 'Accept or reject suggestions in-app. Your coworker sees refined comments, not AI slop.' },
]

function Landing() {
  const [activeFeature, setActiveFeature] = useState(0)
  const videoRefs = useRef([])
  const tabsRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({})

  // Track landing page view on mount
  useEffect(() => {
    trackEvent('Page Viewed', { page: 'landing' })
  }, [])

  // Update indicator position when active tab changes
  useEffect(() => {
    if (!tabsRef.current) return
    const activeBtn = tabsRef.current.querySelectorAll('.feature-tab')[activeFeature]
    if (!activeBtn) return
    const parentRect = tabsRef.current.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()
    setIndicatorStyle({
      left: btnRect.left - parentRect.left,
      width: btnRect.width,
    })
  }, [activeFeature])

  // Play active video, pause others
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return
      if (i === activeFeature) {
        video.currentTime = 0
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    })
  }, [activeFeature])

  const handleFeatureClick = useCallback((id) => {
    trackEvent('Feature Tab Clicked', { tab_id: id, tab_name: featureTabs[id].label })
    setActiveFeature(id)
  }, [])

  return (
    <>
      <nav>
        <div className="nav-inner">
          <a href="/" className="logo">
            <svg className="logo-mark" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12.0667" cy="11.9999" r="6.6" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12.0667" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.33333"/>
              <circle cx="12" cy="12" r="11.5" stroke="currentColor"/>
            </svg>
            Fresnel
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="https://releases.reviewgpt.ca/latest/Fresnel.dmg" className="btn-primary btn-chip" download onClick={() => trackEvent('Download Clicked', { location: 'nav' })}>Download Now</a>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>Built to help your team ship faster,<br />Fresnel helps you review code with AI.</h1>
            <div className="buttons">
              <a href="https://releases.reviewgpt.ca/latest/Fresnel.dmg" className="btn-primary" download onClick={() => trackEvent('Download Clicked', { location: 'hero' })}>Download for macOS <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{marginLeft: '6px'}}><path d="M8 1.5V9M8 9L5 6M8 9L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 10V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5H12.5C13.0523 13.5 13.5 13.0523 13.5 12.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></a>
            </div>
          </div>
        </section>

        <section className="screenshot">
          <div className="screenshot-box">
            <video
              src="/demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              onLoadedData={(e) => e.target.classList.add('loaded')}
            />
          </div>
        </section>

        <section className="dark-section">
          <div className="hero-text-overlay">
            <h2>You've got code.</h2>
            <p>Never miss a code review again.</p>
          </div>
          <div className="hero-images">
            <img src={tahoeWallpaper} alt="Fresnel" className="hero-image" />
            <img src={dockImage} alt="Dock" className="dock-overlay" />
          </div>
        </section>

        <section className="features" id="features">
          <h2>Code review at light speed</h2>

          <div className="feature-tabs" ref={tabsRef}>
            {featureTabs.map((tab) => (
              <button
                key={tab.id}
                className={`feature-tab ${activeFeature === tab.id ? 'active' : ''}`}
                onClick={() => handleFeatureClick(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <div
              className="feature-tab-indicator"
              style={{
                transform: `translateX(${indicatorStyle.left ?? 0}px)`,
                width: indicatorStyle.width ?? 0,
              }}
            />
          </div>

          <div className="feature-desc">
            <h3 className="feature-title">{featureTabs[activeFeature].title}</h3>
            <p className="feature-text">{featureTabs[activeFeature].desc}</p>
          </div>

          <div className="feature-viewport">
            <div
              className="feature-slides"
              style={{ transform: `translateX(${-activeFeature * (100 / featureTabs.length)}%)` }}
            >
              {featureTabs.map((tab, i) => (
                <div className="feature-slide" key={tab.id}>
                  <video
                    ref={(el) => (videoRefs.current[i] = el)}
                    src={tab.video}
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onLoadedData={(e) => e.target.classList.add('loaded')}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="review-section" id="how-it-works">
          <div className="review-content">
            <div className="review-text">
              <h2>Don't repeat yourself</h2>
              <p>
                Fresnel suggests comments to add to your review. Your teammates 
                see thoughtful, human curated feedback.
              </p>
            </div>
            
            <div className="prompt-window">
              <div className="prompt-header">
                <div className="prompt-logo">
                  <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <rect x="2" y="2" width="20" height="20" rx="4.5" fill="url(#fresnel-header)"/>
                    <path d="M12 6L6 9.5L12 13L18 9.5L12 6Z" fill="white" fillOpacity="0.95"/>
                    <path d="M6 12.5L12 16L18 12.5" stroke="white" strokeWidth="1.5" strokeOpacity="0.8"/>
                    <defs>
                      <linearGradient id="fresnel-header" x1="2" y1="2" x2="22" y2="22">
                        <stop stopColor="#7C3AED"/>
                        <stop offset="1" stopColor="#A855F7"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <span>Fresnel</span>
                </div>
              </div>
              <div className="prompt-input">
                <span className="prompt-text">Find React anti-patterns in this PR</span>
                <span className="prompt-cursor"></span>
              </div>
              <div className="prompt-results">
                <div className="comment-card">
                  <div className="comment-header">
                    <img 
                      className="comment-avatar" 
                      src="https://avatars.githubusercontent.com/u/6249465?v=4" 
                      alt="Mitch Hynes"
                    />
                    <span className="comment-author">Mitch Hynes</span>
                    <span className="comment-time">just now on src/App.jsx</span>
                  </div>
                  <div className="comment-body">
                    <p>
                      The <code>useEffect</code> on line 42 syncs state that can be derived directly from props. 
                      If the parent re-renders with new data, this creates an unnecessary render cycle and 
                      can lead to stale state bugs.
                    </p>
                    <p>Consider deriving the value directly:</p>
                    <pre><code><span className="code-keyword">const</span> count = items.<span className="code-property">length</span>;</code></pre>
                    <p className="comment-link">
                      See: <a href="https://react.dev/learn/you-might-not-need-an-effect" target="_blank" rel="noopener">
                        You Might Not Need an Effect
                      </a>, React Docs
                    </p>
                  </div>
                  <div className="comment-actions">
                    <div className="comment-btn dismiss">Dismiss</div>
                    <div className="comment-btn add">Add to review</div>
                  </div>
                </div>
                
                <div className="comment-card faded">
                  <div className="comment-header">
                    <img 
                      className="comment-avatar" 
                      src="https://avatars.githubusercontent.com/u/6249465?v=4" 
                      alt="Mitch Hynes"
                    />
                    <span className="comment-author">Mitch Hynes</span>
                    <span className="comment-time">just now on src/Button.tsx</span>
                  </div>
                  <div className="comment-body">
                    <p>
                      The <code>onClick</code> handler on line 87 is empty. Users will click this button 
                      expecting something to happen, but nothing will. This creates a confusing UX.
                    </p>
                  </div>
                </div>
                <div className="fade-overlay"></div>
              </div>
            </div>
          </div>
        </section>

        <section className="bottom-cta">
          <p>Code review doesn't have to be a chore.</p>
          <a href="https://releases.reviewgpt.ca/latest/Fresnel.dmg" className="btn-primary" download onClick={() => trackEvent('Download Clicked', { location: 'bottom_cta' })}>Download Now</a>
        </section>

      </main>

      <footer>
        <p>© 2026 Fresnel</p>
      </footer>

    </>
  )
}

export default Landing
