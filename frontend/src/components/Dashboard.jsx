import React from 'react';
import { Activity, Moon, Sun, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import NodeCard from './NodeCard';
import IonAssistChat from './IonAssistChat';

const Dashboard = () => {
    const { theme, setTheme, logout, nodeDataMap, isConnected } = useApp();

    const activeNodes = Object.keys(nodeDataMap).sort((a, b) => {
        // Safe numerical sorting if Node-X format is present
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    return (
        <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`} style={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#f1f5f9' }}>
            <header className={`h-20 border-b flex items-center justify-between px-8 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-4">
                    <img 
                        src="/logo.png" 
                        alt="Ionfiltra Logo" 
                        className={`h-10 transition-all ${theme === 'dark' ? 'bg-white bg-opacity-95 p-1.5 rounded-lg shadow-sm' : ''}`}
                    />
                    {!isConnected && <span className="ml-4 text-xs bg-red-500/20 text-red-500 px-2 py-1 rounded">Stream Disconnected</span>}
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-3 rounded-xl hover:bg-blue-500/10 transition">
                        {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
                    </button>
                    <button onClick={logout} className="p-3 rounded-xl text-red-500 hover:bg-red-500/10 transition">
                        <LogOut size={20}/>
                    </button>
                </div>
            </header>

            <main className="flex-1 p-8 flex flex-col">
                {activeNodes.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                        <Activity size={48} className="mb-4 animate-pulse" />
                        <h2 className="text-xl font-bold">Waiting for Telemetry</h2>
                        <p className="text-sm">No sensor nodes are currently transmitting data to the database.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                        {activeNodes.map(nodeId => (
                            <NodeCard 
                                key={nodeId} 
                                nodeId={nodeId} 
                                data={nodeDataMap[nodeId] || []} 
                                isPlaceholder={false} 
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Floating Chat */}
            <IonAssistChat />
        </div>
    );
};

export default Dashboard;
