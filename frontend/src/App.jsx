import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AgentHomePage from './pages/AgentHomePage';
import AuthSuccessPage from './pages/AuthSuccessPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ItineraryPlannerPage from './pages/ItineraryPlannerPage';
import TravelAlerts from './pages/TravelAlerts';
import WeatherDashboard from './pages/weatherDashboard';
// import weatherDashboard from '.pages/weatherForecast';

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/success" element={<AuthSuccessPage />} />
        <Route path="/agent-home" element={<AgentHomePage />} />
        <Route path="/itinerary-planner" element={<ItineraryPlannerPage />} />
            <Route path="/travel-alerts" element={<TravelAlerts />} />
                <Route path="/weather-dashboard" element={<WeatherDashboard  />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
