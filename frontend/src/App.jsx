import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AgentHomePage from './pages/AgentHomePage';
import ItineraryPlannerPage from './pages/ItineraryPlannerPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TravelAlerts from './components/TravelAlerts';
import WeatherDashboard from './components/WeatherForecast';
import { getCurrentUser } from './api';
// import weatherDashboard from '.pages/weatherForecast';

export default function App() {
  const location = useLocation();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      setAuthLoading(true);
      try {
        const resp = await getCurrentUser();
        setUser(resp.user || null);
      } catch (_err) {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();
  }, [location.pathname]);

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-200">
        <p>Verifying session...</p>
      </div>
    );
  }

  const Protected = ({ children }) => (user ? children : <Navigate to="/login" replace />);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={user ? <Navigate to="/agent-home" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/agent-home" replace /> : <RegisterPage />} />
        <Route path="/agent-home" element={<Protected><AgentHomePage /></Protected>} />
        <Route path="/itinerary-planner" element={<Protected><ItineraryPlannerPage /></Protected>} />
        <Route path="/travel-alerts" element={<Protected><TravelAlerts /></Protected>} />
        <Route path="/weather-dashboard" element={<Protected><WeatherDashboard /></Protected>} />
        <Route path="*" element={<Navigate to={user ? '/agent-home' : '/login'} replace />} />
      </Routes>
    </AnimatePresence>
  );
}
