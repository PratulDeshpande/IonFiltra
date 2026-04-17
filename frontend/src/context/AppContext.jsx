import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
    const [theme, setTheme] = useState('light');
    const [view, setView] = useState('login');
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [nodeDataMap, setNodeDataMap] = useState({});
    const [isConnected, setIsConnected] = useState(false);

    const isInitialized = useRef(false);
    const eventSourceRef = useRef(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // Initial auth check
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const storedToken = localStorage.getItem('ion_token');
        const storedUser = localStorage.getItem('ion_user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            setView('location');
        }
    }, []);

    // Fetch initial history and streaming when entering dashboard
    useEffect(() => {
        if (view !== 'dashboard' || !token) {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                setIsConnected(false);
            }
            return;
        }

        // Fetch History
        fetch(`${API_BASE_URL}/api/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(json => {
                if (json.success && Array.isArray(json.data)) {
                    const grouped = {};
                    json.data.reverse().forEach(record => {
                        const id = record.device_id || 'Unknown-Node';
                        if (!grouped[id]) grouped[id] = [];
                        grouped[id].push(record);
                    });
                    setNodeDataMap(grouped);
                }
            }).catch(err => console.error("Initial data load error:", err));

        // Connect SSE with token in query
        const eventSource = new EventSource(`${API_BASE_URL}/api/stream?token=${token}`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => setIsConnected(true);
        eventSource.onmessage = (event) => {
            if (event.data === '{"ping":true}') return;
            try {
                const newData = JSON.parse(event.data);
                const nodeId = newData.device_id || 'Unknown-Node';
                setNodeDataMap(prev => {
                    const currentList = prev[nodeId] || [];
                    const updatedList = [...currentList, newData];
                    if (updatedList.length > 50) updatedList.shift();
                    return { ...prev, [nodeId]: updatedList };
                });
            } catch (e) { }
        };
        eventSource.onerror = () => {
            setIsConnected(false);
            eventSource.close();
        };

        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
        };
    }, [view, token]);

    const login = async (username, password) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                setToken(data.token);
                setUser(data.user);
                localStorage.setItem('ion_token', data.token);
                localStorage.setItem('ion_user', JSON.stringify(data.user));
                setView('location');
                return true;
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            alert(err.message || "Login failed");
            return false;
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        setNodeDataMap({});
        setSelectedLocation(null);
        localStorage.removeItem('ion_token');
        localStorage.removeItem('ion_user');
        setView('login');
    };

    const updateView = (newView) => setView(newView);
    const selectLocation = (loc) => {
        if (loc === 'Pune') {
            setSelectedLocation(loc);
            setView('dashboard');
        } else {
            alert("⚠️ Connection offline for this location.");
        }
    };

    return (
        <AppContext.Provider value={{
            theme, setTheme,
            view, updateView,
            user, token, login, logout,
            selectedLocation, selectLocation,
            nodeDataMap, isConnected,
            API_BASE_URL
        }}>
            {children}
        </AppContext.Provider>
    );
};
