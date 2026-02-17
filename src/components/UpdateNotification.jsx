import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Gift, X } from '@phosphor-icons/react'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

export default function UpdateNotification() {
  const [updateState, setUpdateState] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [version, setVersion] = useState(null)

  useEffect(() => {
    if (!isElectron) return

    const cleanup = window.electronAPI.onUpdateStatus((data) => {
      setUpdateState(data.status)
      if (data.version) setVersion(data.version)
      if (data.status === 'downloaded') setDismissed(false)
    })

    return cleanup
  }, [])

  const handleInstall = useCallback(() => {
    if (isElectron) {
      window.electronAPI.installUpdate()
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  const showNotification = isElectron && updateState === 'downloaded' && !dismissed

  return (
    <AnimatePresence>
      {showNotification && (
        <motion.div
          className="update-toast"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <div className="update-toast-header">
            <div className="update-toast-title-row">
              <div className="update-toast-icon-wrapper">
                <Gift weight="fill" size={18} />
              </div>
              <span className="update-toast-title">New update available</span>
            </div>
            <button
              type="button"
              className="update-toast-close"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X weight="bold" size={13} />
            </button>
          </div>
          {version && (
            <p className="update-toast-version">Version {version} is ready to install</p>
          )}
          <button
            type="button"
            className="update-toast-action"
            onClick={handleInstall}
          >
            Update now
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
