import { WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

export function StatusBanner({ message, onDismiss }) {
  const [dismissed, setDismissed] = useState(false)

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <AnimatePresence>
      {message && !dismissed && (
        <motion.div
          initial={{ opacity: 1, height: 'auto' }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ ease: 'easeOut', duration: 0.2 }}
          className="status-banner"
        >
          <div className="status-banner-content">
            <WarningCircle weight="fill" className="status-banner-icon" size={18} />
            <span className="status-banner-text">{message}</span>
            <button
              type="button"
              onClick={handleDismiss}
              className="status-banner-dismiss"
              aria-label="Dismiss"
            >
              <X weight="bold" size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
