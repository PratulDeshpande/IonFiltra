import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
    const [theme, setTheme] = useState('light');
    const [view, setView] = useState('login');
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [facilities, setFacilities] = useState([]);
    const [nodeDataMap, setNodeDataMap] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);

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

    // Initial auth check via LocalStorage Token
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const checkAuth = async () => {
            const storedToken = localStorage.getItem('ion_token');
            if (!storedToken) {
                setIsInitializing(false);
                return;
            }
            setToken(storedToken);

            try {
                const res = await fetch(`${API_BASE_URL}/api/me`, { 
                    headers: { 'Authorization': `Bearer ${storedToken}` },
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success && data.user) {
                    setUser(data.user);
                    setView('location');
                } else {
                    localStorage.removeItem('ion_token');
                }
            } catch (err) {
                console.error("Not authenticated");
                localStorage.removeItem('ion_token');
            } finally {
                setIsInitializing(false);
            }
        };
        checkAuth();
    }, []);

    const fetchFacilities = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/facilities`, {
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) setFacilities(data.facilities);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (view === 'location' && token) {
            fetchFacilities();
        }
    }, [view, token]);

    // Fetch initial history and streaming when entering dashboard
    useEffect(() => {
        if (view !== 'dashboard' || !user || !token) {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                setIsConnected(false);
            }
            return;
        }

        // Fetch History
        fetch(`${API_BASE_URL}/api/data`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
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

        // Connect SSE with query token
        // NOTE: EventSource API does not support custom headers.
        // The JWT is passed as a query parameter, which exposes it in server logs.
        // This is a known limitation. Mitigation: JWT expires in 12h, HTTPS encrypts in transit.
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
    }, [view, user, token]);

    const login = async (username, password) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                setUser(data.user);
                setToken(data.token);
                localStorage.setItem('ion_token', data.token);
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

    const logout = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/logout`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
        } catch (e) { console.error(e); }
        
        setUser(null);
        setToken(null);
        localStorage.removeItem('ion_token');
        setNodeDataMap({});
        setSelectedLocation(null);
        setView('login');
    };

    const updateView = (newView) => setView(newView);
    const selectLocation = (loc) => {
        if (loc.status === 'online') {
            setSelectedLocation(loc.name);
            setView('dashboard');
        } else {
            alert(`⚠️ Connection offline for ${loc.name}.`);
        }
    };

    return (
        <AppContext.Provider value={{
            theme, setTheme,
            view, updateView,
            user, token, login, logout,
            selectedLocation, selectLocation,
            facilities,
            nodeDataMap, isConnected,
            isInitializing,
            API_BASE_URL
        }}>
            {children}
        </AppContext.Provider>
    );
};
