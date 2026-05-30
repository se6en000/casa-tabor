import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { useTravelScan } from './hooks/useTravelScan'
import { ThemeProvider } from './contexts/ThemeContext'
import { TopBarC } from './components/shared/TopBar'

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
    <div className="flex flex-col h-screen overflow-hidden bg-casa-bg">
      {/* Full-width top bar — sticky, never scrolls */}
      <TopBarC />

      <div className="flex flex-1 min-h-0 pb-[--spacing-nav-height] lg:pb-0">
        <TabletSidebar />
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <AnimatedRoutes />
        </div>
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
