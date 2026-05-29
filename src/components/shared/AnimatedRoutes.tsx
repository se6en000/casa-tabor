import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import HomePage from '../../pages/HomePage'
import CalendarPage from '../../pages/CalendarPage'
import BriefingPage from '../../pages/BriefingPage'
import SettingsPage from '../../pages/SettingsPage'
import CalendarsSettingsPage from '../../pages/CalendarsSettingsPage'
import AISettingsPage from '../../pages/AISettingsPage'
import FamilySettingsPage from '../../pages/FamilySettingsPage'
import DisplaySettingsPage from '../../pages/DisplaySettingsPage'
import SmsSettingsPage from '../../pages/SmsSettingsPage'
import MusicPage from '../../pages/MusicPage'
import GmailScanPage from '../../pages/GmailScanPage'
import TabletPrototypePage from '../../pages/TabletPrototypePage'
import TripDetailPage from '../../pages/TripDetailPage'
import ThemeSettingsPage from '../../pages/ThemeSettingsPage'
import PageTransition from './PageTransition'

export default function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
        <Route path="/calendar" element={<PageTransition><CalendarPage /></PageTransition>} />
        <Route path="/music" element={<PageTransition><MusicPage /></PageTransition>} />
        <Route path="/briefing" element={<PageTransition><BriefingPage /></PageTransition>} />
        <Route path="/settings" element={<PageTransition><SettingsPage /></PageTransition>} />
        <Route path="/settings/calendars" element={<PageTransition><CalendarsSettingsPage /></PageTransition>} />
        <Route path="/settings/ai" element={<PageTransition><AISettingsPage /></PageTransition>} />
        <Route path="/settings/family" element={<PageTransition><FamilySettingsPage /></PageTransition>} />
        <Route path="/settings/display" element={<PageTransition><DisplaySettingsPage /></PageTransition>} />
        <Route path="/settings/sms" element={<PageTransition><SmsSettingsPage /></PageTransition>} />
        <Route path="/settings/gmail-scan" element={<PageTransition><GmailScanPage /></PageTransition>} />
        <Route path="/prototype" element={<TabletPrototypePage />} />
        <Route path="/trips/:id" element={<PageTransition><TripDetailPage /></PageTransition>} />
        <Route path="/settings/theme" element={<PageTransition><ThemeSettingsPage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  )
}
