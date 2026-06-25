import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import HomePage from '../../pages/HomePage'
import CalendarPage from '../../pages/CalendarPage'
import BriefingPage from '../../pages/BriefingPage'
import GroceryPage from '../../pages/GroceryPage'
import GoogleServicesPage from '../../pages/GoogleServicesPage'
import AISettingsPage from '../../pages/AISettingsPage'
import FamilySettingsPage from '../../pages/FamilySettingsPage'
import DisplaySettingsPage from '../../pages/DisplaySettingsPage'
import ArtModeSettingsPage from '../../pages/ArtModeSettingsPage'
import SmsSettingsPage from '../../pages/SmsSettingsPage'
import MusicPage from '../../pages/MusicPage'
import CookPage from '../../pages/CookPage'
import TabletPrototypePage from '../../pages/TabletPrototypePage'
import TripDetailPage from '../../pages/TripDetailPage'
import HomeSettingsPage from '../../pages/HomeSettingsPage'
import StatusDashboardPage from '../../pages/StatusDashboardPage'
import DataAnalyticsPage from '../../pages/DataAnalyticsPage'
import GroceryIntelligenceSettingsPage from '../../pages/GroceryIntelligenceSettingsPage'
import SavedPlacesSettingsPage from '../../pages/SavedPlacesSettingsPage'
import ActionHubPage from '../../pages/ActionHubPage'
import SettingsShell from '../settings/SettingsShell'
import PageTransition from './PageTransition'

export default function AnimatedRoutes() {
  const location = useLocation()
  // Use top-level path for AnimatePresence key so shell persists across sub-routes
  const topPath = '/' + (location.pathname.split('/')[1] ?? '')
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={topPath}>
        <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
        <Route path="/calendar" element={<PageTransition><CalendarPage /></PageTransition>} />
        <Route path="/grocery" element={<PageTransition><GroceryPage /></PageTransition>} />
        <Route path="/cook" element={<PageTransition><CookPage /></PageTransition>} />
        <Route path="/music" element={<PageTransition><MusicPage /></PageTransition>} />
        <Route path="/briefing" element={<PageTransition><BriefingPage /></PageTransition>} />
        <Route path="/actions" element={<PageTransition><ActionHubPage /></PageTransition>} />
        <Route path="/prototype" element={<TabletPrototypePage />} />
        <Route path="/trips/:id" element={<PageTransition><TripDetailPage /></PageTransition>} />

        {/* Settings — shell wraps all sub-pages with sidebar nav */}
        <Route path="/settings" element={<PageTransition><SettingsShell /></PageTransition>}>
          <Route index element={<Navigate to="/settings/display" replace />} />
          <Route path="family"     element={<FamilySettingsPage />} />
          <Route path="home"       element={<HomeSettingsPage />} />
          <Route path="profile"    element={<Navigate to="/settings/home" replace />} />
          <Route path="places"     element={<SavedPlacesSettingsPage />} />
          <Route path="google"     element={<GoogleServicesPage />} />
          <Route path="calendars"  element={<Navigate to="/settings/google" replace />} />
          <Route path="gmail-scan" element={<Navigate to="/settings/google" replace />} />
          <Route path="ai"         element={<AISettingsPage />} />
          <Route path="sms"        element={<SmsSettingsPage />} />
          <Route path="music"      element={<MusicPage />} />
          <Route path="display"    element={<DisplaySettingsPage />} />
          <Route path="art-mode"   element={<ArtModeSettingsPage />} />
          <Route path="screensaver" element={<Navigate to="/settings/display" replace />} />
          <Route path="theme"      element={<Navigate to="/settings/display" replace />} />
          <Route path="status"     element={<StatusDashboardPage />} />
          <Route path="analytics"  element={<DataAnalyticsPage />} />
          <Route path="grocery-intelligence"  element={<GroceryIntelligenceSettingsPage />} />
        </Route>
      </Routes>
    </AnimatePresence>
  )
}
