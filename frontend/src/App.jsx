import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Clock, LayoutDashboard, Map, CloudSun, Bell, LogOut, User } from 'lucide-react'; // Using Lucide for clean icons

import AgentHomePage from './pages/AgentHomePage';
import ItineraryPlannerPage from './pages/ItineraryPlannerPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TravelAlerts from './components/TravelAlerts';
import WeatherDashboard from './components/WeatherForecast';
import History from './pages/History';
import { getCurrentUser } from './api';

// --- Global Header Component ---
const Header = ({ user, setUser }) => {
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-8">
        <Link to="/agent-home" className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          GRIFO-Ops
        </Link>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <Link to="/agent-home" className="hover:text-white flex items-center gap-2 transition-colors">
            <LayoutDashboard size={18} /> Dashboard
          </Link>
          <Link to="/itinerary-planner" className="hover:text-white flex items-center gap-2 transition-colors">
            <Map size={18} /> Planner
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* FIXED: Dynamic Routing using user._id */}
        <Link 
          to={`/history/${user._id || user.id}`} 
          className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-blue-400 transition-all"
          title="My History"
        >
          <Clock size={22} />
        </Link>

        <Link to="/weather-dashboard" className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-yellow-400 transition-all">
          <CloudSun size={22} />
        </Link>

        <Link to="/travel-alerts" className="p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-red-400 transition-all">
          <Bell size={22} />
        </Link>

        <div className="h-6 w-[1px] bg-slate-800 mx-2" />

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end hidden sm:block">
            <span className="text-xs text-slate-200 font-medium">{user.name || 'Agent'}</span>
            <span className="text-[10px] text-slate-500">Active Session</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-red-950/30 text-slate-400 hover:text-red-400 transition-all"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
};
// --- Main App Component ---
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 animate-pulse">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  const Protected = ({ children }) => (user ? children : <Navigate to="/login" replace />);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Header is outside Routes so it never re-renders/blinks on navigation */}
      <Header user={user} setUser={setUser} />

      <main className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            {/* Auth Routes */}
            <Route path="/login" element={user ? <Navigate to="/agent-home" replace /> : <LoginPage />} />
            <Route path="/register" element={user ? <Navigate to="/agent-home" replace /> : <RegisterPage />} />
            
            {/* Protected Application Routes */}
            <Route path="/agent-home" element={<Protected><AgentHomePage /></Protected>} />
            <Route path="/itinerary-planner" element={<Protected><ItineraryPlannerPage /></Protected>} />
            <Route path="/travel-alerts" element={<Protected><TravelAlerts /></Protected>} />
            
            {/* History Route - Make sure the Link in Header matches this pattern */}
            <Route path="/history/:id" element={<Protected><History /></Protected>} />
            
            <Route path="/weather-dashboard" element={<Protected><WeatherDashboard /></Protected>} />
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to={user ? '/agent-home' : '/login'} replace />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}