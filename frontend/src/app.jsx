import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Auth from './components/Auth';
import LocationSelector from './components/LocationSelector';
import Dashboard from './components/Dashboard';

const MainApp = () => {
    const { view } = useApp();

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