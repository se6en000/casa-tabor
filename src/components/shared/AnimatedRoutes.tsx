import { Suspense } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { lazyWithReload } from '../../utils/lazyWithReload'
import { Skeleton } from '../ui/Skeleton'
// Home and Calendar are the two pages actually used most of the time on this
// kiosk -- kept as regular eager imports so the common case has zero loading
// flicker. Every other page is code-split (see tests/route-code-splitting.test.mjs):
// previously ALL of these shipped in one 2.9MB bundle, so opening Grocery
// List downloaded the entire AI assistant/recipe importer/music player too.
import HomePage from '../../pages/HomePage'
import CalendarPage from '../../pages/CalendarPage'
import LivingCanvasHome from '../canvas/LivingCanvasHome'
import PageTransition from './PageTransition'
import { useAppStore } from '../../stores/appStore'

const BriefingPage = lazyWithReload(() => import('../../pages/BriefingPage'), 'briefing')
const GroceryPage = lazyWithReload(() => import('../../pages/GroceryPage'), 'grocery')
const GoogleServicesPage = lazyWithReload(() => import('../../pages/GoogleServicesPage'), 'google-services')
const AISettingsPage = lazyWithReload(() => import('../../pages/AISettingsPage'), 'ai-settings')
const FamilySettingsPage = lazyWithReload(() => import('../../pages/FamilySettingsPage'), 'family-settings')
const DisplaySettingsPage = lazyWithReload(() => import('../../pages/DisplaySettingsPage'), 'display-settings')
const ArtModeSettingsPage = lazyWithReload(() => import('../../pages/ArtModeSettingsPage'), 'art-mode-settings')
const SmsSettingsPage = lazyWithReload(() => import('../../pages/SmsSettingsPage'), 'sms-settings')
const MusicPage = lazyWithReload(() => import('../../pages/MusicPage'), 'music')
const TabletPrototypePage = lazyWithReload(() => import('../../pages/TabletPrototypePage'), 'tablet-prototype')
const TripDetailPage = lazyWithReload(() => import('../../pages/TripDetailPage'), 'trip-detail')
const CookPage = lazyWithReload(() => import('../../pages/CookPage'), 'cook')
const CookPrototypeMediumPage = lazyWithReload(() => import('../../pages/CookPrototypeMediumPage'), 'cook-prototype-medium')
const CookPrototypeLivingCanvasPage = lazyWithReload(() => import('../../pages/CookPrototypeLivingCanvasPage'), 'cook-prototype-living-canvas')
const StatusDashboardPage = lazyWithReload(() => import('../../pages/StatusDashboardPage'), 'status-dashboard')
const DataAnalyticsPage = lazyWithReload(() => import('../../pages/DataAnalyticsPage'), 'data-analytics')
const GroceryIntelligenceSettingsPage = lazyWithReload(() => import('../../pages/GroceryIntelligenceSettingsPage'), 'grocery-intelligence-settings')
const SavedPlacesSettingsPage = lazyWithReload(() => import('../../pages/SavedPlacesSettingsPage'), 'saved-places-settings')
const ActionHubPage = lazyWithReload(() => import('../../pages/ActionHubPage'), 'action-hub')
const FoodProfileSettingsPage = lazyWithReload(() => import('../../pages/FoodProfileSettingsPage'), 'food-profile-settings')
const AdminOpsPage = lazyWithReload(() => import('../../pages/AdminOpsPage'), 'admin-ops')
const DesignSystemGalleryPage = lazyWithReload(() => import('../../pages/DesignSystemGalleryPage'), 'design-system-gallery')
const MemorySettingsPage = lazyWithReload(() => import('../../pages/MemorySettingsPage'), 'memory-settings')
const ProjectSettingsPage = lazyWithReload(() => import('../../pages/ProjectSettingsPage'), 'project-settings')
const SettingsShell = lazyWithReload(() => import('../settings/SettingsShell'), 'settings-shell')

function RouteFallback() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-6" aria-label="Loading page">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export default function AnimatedRoutes() {
  const location = useLocation()
  const experienceMode = useAppStore((s) => s.experienceMode)
  // Use top-level path for AnimatePresence key so shell persists across sub-routes
  const topPath = '/' + (location.pathname.split('/')[1] ?? '')
  return (
    <Suspense fallback={<RouteFallback />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={topPath}>
          <Route
            path="/"
            element={
              <PageTransition>
                {experienceMode === 'living_canvas' ? <LivingCanvasHome /> : <HomePage />}
              </PageTransition>
            }
          />
          <Route path="/calendar" element={<PageTransition><CalendarPage /></PageTransition>} />
          <Route path="/grocery" element={<PageTransition><GroceryPage /></PageTransition>} />
          <Route path="/cook" element={<PageTransition><CookPage /></PageTransition>} />
          <Route path="/prototype/cook-medium" element={<PageTransition><CookPrototypeMediumPage /></PageTransition>} />
          <Route path="/prototype/cook-high" element={<PageTransition><CookPrototypeLivingCanvasPage /></PageTransition>} />
          <Route path="/music" element={<PageTransition><MusicPage /></PageTransition>} />
          <Route path="/briefing" element={<PageTransition><BriefingPage /></PageTransition>} />
          <Route path="/actions" element={<PageTransition><ActionHubPage /></PageTransition>} />
          <Route path="/prototype" element={<TabletPrototypePage />} />
          <Route path="/trips/:id" element={<PageTransition><TripDetailPage /></PageTransition>} />

          {/* Settings — shell wraps all sub-pages with sidebar nav */}
          <Route path="/settings" element={<PageTransition><SettingsShell /></PageTransition>}>
            <Route index element={<Navigate to="/settings/display" replace />} />
            <Route path="family"     element={<FamilySettingsPage />} />
            <Route path="home"       element={<SavedPlacesSettingsPage initialTab="home" />} />
            <Route path="profile"    element={<Navigate to="/settings/places?tab=home" replace />} />
            <Route path="places"     element={<SavedPlacesSettingsPage initialTab="places" />} />
            <Route path="google"     element={<GoogleServicesPage />} />
            <Route path="calendars"  element={<Navigate to="/settings/google" replace />} />
            <Route path="gmail-scan" element={<Navigate to="/settings/google" replace />} />
            <Route path="ai"         element={<AISettingsPage />} />
            <Route path="ai/shortcuts" element={<AISettingsPage />} />
            <Route path="bug-tracker" element={<Navigate to="/settings/ai" replace />} />
            <Route path="memory" element={<MemorySettingsPage />} />
            <Route path="memory/projects" element={<ProjectSettingsPage />} />
            <Route path="memory/food-profile" element={<FoodProfileSettingsPage initialTab="diet" />} />
            <Route path="sms"        element={<SmsSettingsPage />} />
            <Route path="music"      element={<Navigate to="/settings/google" replace />} />
            <Route path="display"    element={<DisplaySettingsPage />} />
            <Route path="art-mode"   element={<ArtModeSettingsPage />} />
            <Route path="screensaver" element={<Navigate to="/settings/display" replace />} />
            <Route path="theme"      element={<Navigate to="/settings/display" replace />} />
            <Route path="status"     element={<StatusDashboardPage />} />
            <Route path="analytics"  element={<DataAnalyticsPage />} />
            <Route path="grocery-intelligence" element={<GroceryIntelligenceSettingsPage />} />
            <Route path="food-profile" element={<FoodProfileSettingsPage initialTab="diet" />} />
            <Route path="pantry-inventory" element={<FoodProfileSettingsPage initialTab="pantry" />} />
            <Route path="admin-ops" element={<AdminOpsPage />} />
            {/* Design-system gallery is available from Settings in every build. */}
            <Route path="design-system" element={<DesignSystemGalleryPage />} />
            {/* Any unknown settings sub-path falls back to a valid page instead
                of rendering a blank Outlet (guards against link/route drift). */}
            <Route path="*" element={<Navigate to="/settings/display" replace />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </Suspense>
  )
}
