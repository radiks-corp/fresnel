import { createContext, useContext } from 'react'

const SidebarContext = createContext({
  onApplyComment: null,
  viewedCount: 0,
  totalFiles: 0,
  setSidebarData: () => {},
  selectedRepo: null,
  reviewIssues: [],
  dismissedIssues: new Set(),
  appliedIssues: new Set(),
  onDismissIssue: () => {},
  onApplyIssue: () => {},
  userAvatar: null,
  userName: null,
})

export const useSidebarContext = () => useContext(SidebarContext)
export default SidebarContext
