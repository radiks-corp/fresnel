import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { trackEvent } from '../hooks/useAnalytics'
import '../landing.css'
import tahoeWallpaper from '../tahoe_wallpaper.jpg'
import dockImage from '../Dock.png'
import screenshotImg from '../screenshot.png'

function Landing() {
  const [expandedCard, setExpandedCard] = useState(null)
  const [lensTilt, setLensTilt] = useState({ x: 0, y: 0 })
  const lensRef = useRef(null)

  // Continuous smooth circular animation
  useEffect(() => {
    let animationFrame
    let startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const duration = 8000 // 8 seconds for full circle
      const progress = (elapsed % duration) / duration
      
      // Circular motion using sin/cos
      const angle = progress * Math.PI * 2
      const radius = 6 // Small tilt amount
      const x = Math.sin(angle) * radius
      const y = -Math.cos(angle) * radius
      
      setLensTilt({ x, y })
      animationFrame = requestAnimationFrame(animate)
    }
    
    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  // Track landing page view on mount
  useEffect(() => {
    trackEvent('Page Viewed', { page: 'landing' })
  }, [])

  // Collapse expanded card on mobile resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768 && expandedCard) {
        setExpandedCard(null)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [expandedCard])

  const handleVideoHover = (e, play) => {
    const video = e.currentTarget.querySelector('video')
    if (video) {
      if (play) {
        video.play()
      } else {
        video.pause()
        video.currentTime = 0
      }
    }
  }

  const handleCardClick = (cardId, e) => {
    // Disable card expansion on mobile
    if (window.innerWidth <= 768) return
    
    const cardNames = { 1: 'Saved Lenses', 2: 'Vibe Check', 3: 'Human-in-the-loop' }
    trackEvent('Feature Card Clicked', { card_id: cardId, card_name: cardNames[cardId] })
    
    const video = e.currentTarget.querySelector('video')
    if (expandedCard === cardId) {
      setExpandedCard(null)
      if (video) {
        video.pause()
        video.currentTime = 0
      }
    } else {
      setExpandedCard(cardId)
      if (video) {
        video.play()
      }
    }
  }

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
            <a href="https://releases.reviewgpt.ca/latest/Fresnel.dmg" className="btn-primary" download onClick={() => trackEvent('Download Clicked', { location: 'nav' })}>Download Now</a>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-content">
            <span className="badge">
              <span className="badge-dot"></span>
              Now available for macOS
            </span>
            <h1>Review code at <span className="light-speed-text">light speed</span></h1>
            <p className="subtitle">The complete AI suite for code review.</p>
            <div className="buttons">
              <a href="https://releases.reviewgpt.ca/latest/Fresnel.dmg" className="btn-primary" download onClick={() => trackEvent('Download Clicked', { location: 'hero' })}>Download Now</a>
              <button className="btn-secondary" onClick={() => trackEvent('Watch Demo Clicked')}>Watch Demo</button>
            </div>
          </div>
        </section>

        <section className="screenshot">
          {/* Lens effect positioned behind screenshot */}
          <div className="lens-backdrop">
            <div className="light-beam-in"></div>
            <motion.div
              ref={lensRef}
              className="lens-effect"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div 
                className="lens-inner"
                style={{
                  transform: `perspective(400px) rotateX(${-lensTilt.y}deg) rotateY(${lensTilt.x}deg)`,
                }}
              >
                <div className="lens-silver-base"></div>
                <svg className="lens-rings" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="95" strokeWidth="5" />
                  <circle cx="100" cy="100" r="88" strokeWidth="4.8" />
                  <circle cx="100" cy="100" r="81" strokeWidth="4.6" />
                  <circle cx="100" cy="100" r="74" strokeWidth="4.4" />
                  <circle cx="100" cy="100" r="67" strokeWidth="4.2" />
                  <circle cx="100" cy="100" r="60" strokeWidth="4" />
                  <circle cx="100" cy="100" r="53" strokeWidth="3.8" />
                  <circle cx="100" cy="100" r="46" strokeWidth="3.5" />
                  <circle cx="100" cy="100" r="39" strokeWidth="3.2" />
                  <circle cx="100" cy="100" r="32" strokeWidth="2.8" />
                  <circle cx="100" cy="100" r="25" strokeWidth="2.4" />
                  <circle cx="100" cy="100" r="18" strokeWidth="2" />
                  <circle cx="100" cy="100" r="11" strokeWidth="1.5" />
                  <circle cx="100" cy="100" r="5" strokeWidth="1" />
                </svg>
                <div className="lens-highlight"></div>
                <div 
                  className="lens-shine"
                  style={{
                    background: `linear-gradient(
                      ${135 - lensTilt.x * 2}deg,
                      transparent 0%,
                      transparent 44%,
                      rgba(255, 255, 255, 0.25) 48%,
                      rgba(255, 255, 255, 0.35) 50%,
                      rgba(255, 255, 255, 0.25) 52%,
                      transparent 56%,
                      transparent 100%
                    )`,
                  }}
                ></div>
              </div>
            </motion.div>

            <div 
              className="light-beam-out"
              style={{
                transform: `translateY(calc(-50% + ${lensTilt.y * 0.5}px))`,
              }}
            >
              <div 
                className="rainbow-beam"
                style={{
                  transform: `rotate(${lensTilt.y * 0.2}deg) scaleY(${1 + Math.abs(lensTilt.x) * 0.005})`,
                  opacity: 0.7 + Math.abs(lensTilt.x) * 0.01,
                }}
              ></div>
            </div>
          </div>

          <div className="screenshot-box">
            <img src={screenshotImg} alt="Fresnel app screenshot" />
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
          <p className="subtitle">AI-powered lenses that understand your codebase.</p>
          
          <div className="cards">
            <motion.div 
              className={`card ${expandedCard === 1 ? 'expanded' : ''}`}
              onClick={(e) => handleCardClick(1, e)}
              onMouseEnter={(e) => !expandedCard && handleVideoHover(e, true)}
              onMouseLeave={(e) => !expandedCard && handleVideoHover(e, false)}
              layout
            >
              <motion.div 
                className="card-video"
                layout
              >
                <video 
                  src="/lens.mp4" 
                  muted 
                  loop 
                  playsInline
                />
                <AnimatePresence>
                  {expandedCard !== 1 && (
                    <motion.div 
                      className="video-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span className="play-icon">▶</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              <motion.div className="card-content" layout>
                <span className="tag">Saved Lenses</span>
                <h3>Lenses that remember</h3>
                <p>
                  Save custom review patterns. Flag useEffect anti-patterns, 
                  catch missing error handling, enforce conventions.
                </p>
              </motion.div>
            </motion.div>
            
            <motion.div 
              className={`card ${expandedCard === 2 ? 'expanded' : ''}`}
              onClick={(e) => handleCardClick(2, e)}
              onMouseEnter={(e) => !expandedCard && handleVideoHover(e, true)}
              onMouseLeave={(e) => !expandedCard && handleVideoHover(e, false)}
              layout
            >
              <motion.div 
                className="card-video"
                layout
              >
                <video 
                  src="/vibe-check.mp4" 
                  muted 
                  loop 
                  playsInline
                />
                <AnimatePresence>
                  {expandedCard !== 2 && (
                    <motion.div 
                      className="video-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span className="play-icon">▶</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              <motion.div className="card-content" layout>
                <span className="tag">On-the-fly</span>
                <h3>Vibe-check any PR</h3>
                <p>
                  Quick ad-hoc reviews when you need a second opinion. 
                  "Will this break prod?" Instant answers.
                </p>
              </motion.div>
            </motion.div>
            
            <motion.div 
              className={`card ${expandedCard === 3 ? 'expanded' : ''}`}
              onClick={(e) => handleCardClick(3, e)}
              onMouseEnter={(e) => !expandedCard && handleVideoHover(e, true)}
              onMouseLeave={(e) => !expandedCard && handleVideoHover(e, false)}
              layout
            >
              <motion.div 
                className="card-video"
                layout
              >
                <video 
                  src="/sends-to-github.mp4" 
                  muted 
                  loop 
                  playsInline
                />
                <AnimatePresence>
                  {expandedCard !== 3 && (
                    <motion.div 
                      className="video-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span className="play-icon">▶</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              <motion.div className="card-content" layout>
                <span className="tag">Human-in-the-loop</span>
                <h3>Actually good AI review</h3>
                <p>
                  Accept or reject suggestions in-app. Your coworker sees 
                  refined comments, not AI slop.
                </p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="review-section" id="how-it-works">
          <div className="review-content">
            <div className="review-text">
              <h2>Generate review comments</h2>
              <p>
                Fresnel surfaces issues before they become problems. Accept 
                what's useful, reject what's not.
              </p>
              <p>
                Your teammates see thoughtful, human-curated feedback.
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
                      src="https://avatars.githubusercontent.com/u/12345678?v=4" 
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
                      src="https://avatars.githubusercontent.com/u/12345678?v=4" 
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
              <div className="prompt-footer">
                <div className="submit-review-btn">Submit review (1 comment)</div>
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
