import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AgentHomePage from './pages/AgentHomePage';
import LoginPage from './pages/LoginPage';
import MissionSummaryPage from './pages/MissionSummaryPage';
import RegisterPage from './pages/RegisterPage';

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<AgentHomePage />} />
        <Route path="/register" element={<RegisterPage />} />
       
      </Routes>
    </AnimatePresence>
  );
}