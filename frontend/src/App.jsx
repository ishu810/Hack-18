import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AgentHomePage from './pages/AgentHomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TravelAlerts from './components/TravelAlerts';
import WeatherDashboard from './components/WeatherForecast';
// import weatherDashboard from '.pages/weatherForecast';

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/agent-home" element={<AgentHomePage />} />
            <Route path="/travel-alerts" element={<TravelAlerts />} />
                <Route path="/weather-dashboard" element={<WeatherDashboard  />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}