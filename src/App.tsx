import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { useTravelScan } from './hooks/useTravelScan'
import { ThemeProvider } from './contexts/ThemeContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
})

function AppShell() {
  useRoomTone()
  useTravelScan()
  return (
    // Mobile: single column with bottom nav padding
    // Tablet (lg+): side-by-side with persistent sidebar, no bottom padding
    <div className="flex min-h-screen bg-casa-bg">
      <TabletSidebar />
      <div className="flex-1 min-w-0 pb-[--spacing-nav-height] lg:pb-0">
        <AnimatedRoutes />
      </div>
      {/* Bottom nav only visible on mobile */}
      <NavBar />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

