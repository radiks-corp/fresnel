import { createContext, useContext } from 'react'

const SidebarContext = createContext({
  onApplyComment: null,
  viewedCount: 0,
  totalFiles: 0,
  setSidebarData: () => {},
  selectedRepo: null,
})

export const useSidebarContext = () => useContext(SidebarContext)
export default SidebarContext
