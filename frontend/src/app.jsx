import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Auth from './components/Auth';
import LocationSelector from './components/LocationSelector';
import Dashboard from './components/Dashboard';

const MainApp = () => {
    const { view, isInitializing, theme } = useApp();

    if (isInitializing) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0f172a] text-slate-200' : 'bg-[#f1f5f9] text-slate-800'}`}>
                <div className="relative flex flex-col items-center animate-pulse">
                    <img src="/logo.png" alt="Ionfiltra Logo" className="h-16 sm:h-24 mb-8 drop-shadow-xl" />
                    <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {view === 'login' && <Auth />}
            {view === 'location' && <LocationSelector />}
            {view === 'dashboard' && <Dashboard />}
        </>
    );
};

export default function App() {
    return (
        <AppProvider>
            <MainApp />
        </AppProvider>
    );
}