import React, { useState } from 'react';
import {
    AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid
} from 'recharts';
import {
    Download, Power, AlertTriangle, CheckCircle2, Server, Activity, Clock, ShieldAlert, Zap
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// Reusable components
const StatusLED = ({ active, color, label }) => (
    <div className="flex flex-col items-center gap-1">
        <div className={`w-3 h-3 rounded-full shadow-sm ${active ? color + ' shadow-' + color.split('-')[1] + '-500/50' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
        <span className="text-[9px] sm:text-[10px] font-bold opacity-60 uppercase">{label}</span>
    </div>
);

const BentoCard = ({ children, title, icon, theme, extraClasses = '' }) => (
    <div className={`rounded-2xl p-3 sm:p-4 border transition-colors ${theme === 'dark' ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'} ${extraClasses}`}>
        {title && (
            <div className="flex items-center gap-1.5 mb-3 opacity-60">
                {icon}
                <h4 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{title}</h4>
            </div>
        )}
        {children}
    </div>
);

const FaultGrid = ({ open1, open2, open3, short1 }) => {
    const channels = [];
    for (let i = 0; i < 48; i++) {
        let isOpen = false;
        let isShort = false;
        if (i < 16) {
            isOpen = (open1 >> i) & 1;
            isShort = (short1 >> i) & 1;
        } else if (i < 32) {
            isOpen = (open2 >> (i - 16)) & 1;
        } else {
            isOpen = (open3 >> (i - 32)) & 1;
        }
        
        let colorClass = "bg-slate-200 dark:bg-slate-700/50"; // Normal
        if (isOpen) colorClass = "bg-red-500 animate-pulse shadow-red-500/50 shadow-md";
        if (isShort) colorClass = "bg-amber-500 animate-pulse shadow-amber-500/50 shadow-md";
        
        channels.push(
            <div key={i} className={`relative group w-full pt-[100%] rounded-sm sm:rounded-md transition-all ${colorClass}`}>
                <div className="absolute inset-0 flex items-center justify-center text-[7px] sm:text-[9px] font-bold opacity-50 group-hover:opacity-100 text-slate-800 dark:text-slate-200">
                    {i + 1}
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-12 gap-1 sm:gap-1.5">
            {channels}
        </div>
    );
};

const NodeCard = ({ nodeId, data, isPlaceholder }) => {
    const { theme, API_BASE_URL, token } = useApp();
    const [tab, setTab] = useState('dashboard');

    const safeData = Array.isArray(data) ? data : [];
    const latest = safeData.length > 0 ? safeData[safeData.length - 1] : {};

    const lastSeen = latest.created_at ? new Date(latest.created_at) : null;
    let timeSince = "Offline";
    let isOnline = false;

    if (lastSeen) {
        const diffMs = Date.now() - lastSeen.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 2) {
            timeSince = "Just now";
            isOnline = true;
        } else if (diffMins < 60) {
            timeSince = `${diffMins} min ago`;
            isOnline = diffMins < 5;
        } else {
            const diffHours = Math.floor(diffMins / 60);
            timeSince = `${diffHours} hr ago`;
        }
    }

    // Determine status string
    const statusLabels = {0: "OFF", 1: "ON", 2: "PAUSE"};
    const chStatusStr = statusLabels[latest.ch_status] || "UNKNOWN";

    let healthStatus = { state: 'HEALTHY', msg: 'System performing optimally', color: 'bg-green-500/10 text-green-500 border-green-500/20' };
    if (latest.sys_ok === false) {
        healthStatus = { state: 'CRITICAL', msg: 'System Not OK', color: 'bg-red-500/10 text-red-500 border-red-500/50 animate-pulse' };
    }

    const handleDownload = async () => {
        if (safeData.length === 0) return alert("System currently in standby.");
        try {
            const response = await fetch(`${API_BASE_URL}/api/export/${nodeId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            if (!response.ok) throw new Error("Export failed");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `LOG_${nodeId}_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            alert("Error downloading historical report: " + e.message);
        }
    };

    const handleEmergencyHold = async () => {
        if (!window.confirm(`⚠️ Are you sure you want to trigger EMERGENCY HOLD for ${nodeId}? This will log a critical event.`)) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/emergency-hold`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                credentials: 'include',
                body: JSON.stringify({ node_id: nodeId.replace('Node-', '') })
            });
            const data = await response.json();
            if (data.success) {
                alert(`✅ Emergency hold logged for ${nodeId}`);
            } else {
                throw new Error(data.error);
            }
        } catch (e) {
            alert("Error triggering emergency hold: " + e.message);
        }
    };

    return (
        <div className={`rounded-3xl overflow-hidden border shadow-xl flex flex-col ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b flex flex-wrap gap-3 justify-between items-center ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className={`p-1.5 sm:p-2 rounded-lg text-white shadow-sm ${isPlaceholder ? 'bg-slate-500' : 'bg-blue-600'}`}><Server size={18} className="sm:w-5 sm:h-5"/></div>
                    <div>
                        <h3 className="font-bold text-base sm:text-lg leading-tight">{nodeId.includes('Node') ? nodeId : `Node ${nodeId}`}</h3>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] sm:text-xs opacity-60">Timer Slave: {latest.timer_slave_id || 'N/A'}</p>
                            <span className="opacity-30 text-[10px]">•</span>
                            <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-500'}`}></div>
                                <p className="text-[10px] sm:text-xs opacity-60">{timeSince}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex bg-slate-800/10 rounded-lg p-1 shrink-0 z-10 relative overflow-x-auto custom-scrollbar">
                    {['dashboard', 'faults', 'config', 'network'].map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition shadow-sm capitalize whitespace-nowrap ${tab === t ? 'bg-blue-600 text-white' : 'opacity-50 hover:opacity-100'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dynamic System Health Banner */}
            {!isPlaceholder && (
                <div className={`px-4 sm:px-6 py-2 flex items-center justify-between text-[10px] sm:text-xs font-bold ${healthStatus.color} ${theme === 'dark' ? 'border-b border-slate-800' : 'border-b border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                        {healthStatus.state === 'HEALTHY' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{healthStatus.state}: {healthStatus.msg}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${latest.system_on ? 'bg-blue-500' : 'bg-slate-500'}`}></div> SYS ON</span>
                        <span className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${latest.svf_rly_stat ? 'bg-green-500' : 'bg-red-500'}`}></div> SVF</span>
                    </div>
                </div>
            )}

            <div className="flex-1 p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                {tab === 'dashboard' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <BentoCard title="Live Relay" icon={<Zap size={14}/>} theme={theme} extraClasses="flex flex-col items-center justify-center py-6">
                                <span className={`text-5xl font-black font-mono tracking-tighter ${latest.ch_status === 1 ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {latest.relay_no || 0}
                                </span>
                                <span className={`mt-2 px-3 py-0.5 rounded-full text-[10px] font-bold ${latest.ch_status === 1 ? 'bg-blue-500/20 text-blue-500' : latest.ch_status === 2 ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-500/20 text-slate-500'}`}>
                                    {chStatusStr}
                                </span>
                            </BentoCard>
                            <BentoCard title="Interlocks" icon={<ShieldAlert size={14}/>} theme={theme} extraClasses="flex items-center justify-around">
                                <StatusLED active={latest.plc_interlock_stat} color="bg-red-500" label="PLC" />
                                <StatusLED active={latest.dp_interlock_stat} color="bg-red-500" label="DP" />
                                <StatusLED active={latest.ip3_interlock_stat} color="bg-red-500" label="IP3" />
                            </BentoCard>
                        </div>
                        <BentoCard title="Relay Activity Timeline" icon={<Activity size={14}/>} theme={theme}>
                            <div className="h-32 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={safeData.slice(-30)}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                        <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '8px' }} />
                                        <YAxis dataKey="relay_no" stroke="#64748b" tick={{ fontSize: 10 }} width={25} />
                                        <Line type="stepAfter" dataKey="relay_no" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </BentoCard>
                    </div>
                )}

                {tab === 'faults' && (
                    <BentoCard title="Channel Matrix (48)" icon={<Activity size={14}/>} theme={theme}>
                        <div className="flex gap-4 mb-4 text-[10px] font-bold opacity-70">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-200 dark:bg-slate-700/50 rounded-sm"></div> OK</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-sm"></div> Open Fault</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 rounded-sm"></div> Short Fault</span>
                        </div>
                        <FaultGrid 
                            open1={latest.ch_open_1_16} open2={latest.ch_open_17_32} open3={latest.ch_open_33_48} 
                            short1={latest.ch_short_1_16} 
                        />
                    </BentoCard>
                )}

                {tab === 'config' && (
                    <div className="space-y-4">
                        <BentoCard title="Timing Limits" icon={<Clock size={14}/>} theme={theme}>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold opacity-50 uppercase">ON Time</span>
                                    <span className="text-xs font-mono">{latest.on_time_lower_limit} - {latest.on_time_higher_limit}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold opacity-50 uppercase">OFF Time</span>
                                    <span className="text-xs font-mono">{latest.off_time_lower_limit} - {latest.off_time_higher_limit}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold opacity-50 uppercase">Pause Time</span>
                                    <span className="text-xs font-mono">{latest.pause_time_lower_limit} - {latest.pause_time_higher_limit}</span>
                                </div>
                            </div>
                        </BentoCard>
                        <BentoCard title="Interlock Configs" icon={<ShieldAlert size={14}/>} theme={theme}>
                            <div className="flex justify-around">
                                <div className="flex flex-col items-center gap-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${latest.plc_interlock ? 'bg-blue-500/20 text-blue-500' : 'bg-slate-500/20 text-slate-500'}`}>{latest.plc_interlock ? 'ENABLED' : 'BYPASS'}</span>
                                    <span className="text-[10px] font-bold opacity-50 uppercase">PLC</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${latest.dp_interlock ? 'bg-blue-500/20 text-blue-500' : 'bg-slate-500/20 text-slate-500'}`}>{latest.dp_interlock ? 'ENABLED' : 'BYPASS'}</span>
                                    <span className="text-[10px] font-bold opacity-50 uppercase">DP</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${latest.ip3_interlock ? 'bg-blue-500/20 text-blue-500' : 'bg-slate-500/20 text-slate-500'}`}>{latest.ip3_interlock ? 'ENABLED' : 'BYPASS'}</span>
                                    <span className="text-[10px] font-bold opacity-50 uppercase">IP3</span>
                                </div>
                            </div>
                        </BentoCard>
                    </div>
                )}

                {tab === 'network' && (
                    <BentoCard title="Network Telemetry" icon={<Activity size={14}/>} theme={theme}>
                        <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={safeData.slice(-30)}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                    <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '8px' }} />
                                    <XAxis dataKey="timestamp" hide />
                                    <YAxis yAxisId="left" stroke="#3b82f6" tick={{ fontSize: 10 }} width={30} domain={['auto', 'auto']} />
                                    <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" tick={{ fontSize: 10 }} width={30} domain={['auto', 'auto']} />
                                    <Area yAxisId="left" type="monotone" dataKey="rssi" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="RSSI" />
                                    <Area yAxisId="right" type="monotone" dataKey="snr" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} name="SNR" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </BentoCard>
                )}
            </div>

            <div className={`p-3 sm:p-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-auto ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                <button onClick={handleDownload} className={`flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition shadow-sm ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}`}><Download size={16} /> Logs Export</button>
                <button onClick={handleEmergencyHold} className="flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition shadow-sm border border-red-500/20 hover:border-transparent"><Power size={16} /> EMERGENCY HOLD</button>
            </div>
        </div>
    );
};

export default NodeCard;
