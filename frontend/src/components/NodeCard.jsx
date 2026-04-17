import React, { useState } from 'react';
import {
    AreaChart, Area, ResponsiveContainer, ComposedChart, CartesianGrid, Tooltip, XAxis, YAxis, Bar, Line
} from 'recharts';
import {
    Wind, Droplets, Gauge, Thermometer, Wifi, Radio, Download, Power, Cpu, Layers, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// Advanced Analytics Chart combining PM and DP correlation
const CorrelatedChart = ({ data, theme }) => (
    <div className={`h-56 rounded-xl p-3 border transition-colors ${theme === 'dark' ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-100 border-slate-200'}`}>
        <p className="text-xs font-bold opacity-60 mb-2 pl-2">CORRELATION: ΔP vs PM EMISSIONS</p>
        <ResponsiveContainer width="100%" height="85%">
            <ComposedChart data={data.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                <XAxis dataKey="timestamp" hide />
                <Tooltip
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px' }}
                    labelFormatter={() => "Snapshot"}
                />
                <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tick={{ fontSize: 10 }} width={35} />
                <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" tick={{ fontSize: 10 }} width={35} />
                <Area yAxisId="left" type="monotone" dataKey="diff_pressure" name="ΔP (mmWC)" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.1} />
                <Bar yAxisId="right" dataKey="pm_level" name="PM (mg)" fill="#8b5cf6" radius={[2, 2, 0, 0]} opacity={0.8} barSize={10} />
            </ComposedChart>
        </ResponsiveContainer>
    </div>
);

// Standard Singular Chart
const AnalyticsChart = ({ label, data, dataKey, color, isBar, theme }) => (
    <div className={`h-32 rounded-xl p-2 border transition-colors ${theme === 'dark' ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-100 border-slate-200'}`}>
        <p className="text-[10px] font-bold opacity-50 mb-1 pl-2">{label}</p>
        <ResponsiveContainer width="100%" height="100%">
            {isBar ? (
                <ComposedChart data={data.slice(-20)}><Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} /></ComposedChart>
            ) : (
                <AreaChart data={data.slice(-20)}><Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.1} /></AreaChart>
            )}
        </ResponsiveContainer>
    </div>
);

// Metric Card with dynamic Progress capacity bars and Trend logic
const MiniMetric = ({ label, value, unit, icon, color, bg, progress = 0, trend = null, theme }) => (
    <div className={`relative p-4 rounded-2xl ${bg === 'default' ? (theme === 'dark' ? 'bg-slate-800' : 'bg-white border-slate-200 shadow-sm') : bg} border border-transparent hover:border-slate-500/20 transition overflow-hidden group`}>
        {/* Dynamic Capacity Progress Bar */}
        <div className="absolute top-0 left-0 h-1 bg-current opacity-20 transition-all duration-300" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%`, color: 'inherit' }} />

        <div className="flex justify-between items-start mb-1 text-[10px] font-bold uppercase opacity-60"><span>{label}</span><span className={color}>{icon}</span></div>
        <div className="flex items-baseline gap-1 relative z-10">
            <span className={`text-xl font-mono font-bold ${color}`}>{value}</span>
            <span className="text-[10px] opacity-40">{unit}</span>

            {/* Live Delta Tending Arrow */}
            {trend !== null && trend !== 0 && (
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${trend > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}
                </span>
            )}
        </div>
    </div>
);

const NodeCard = ({ nodeId, data, isPlaceholder }) => {
    const { theme, API_BASE_URL, token } = useApp();
    const [tab, setTab] = useState('overview');

    const safeData = Array.isArray(data) ? data : [];
    const latest = safeData.length > 0 ? safeData[safeData.length - 1] : {};

    // Calculate Trends (current vs reading from ~5 ticks ago)
    const pastReading = safeData.length > 5 ? safeData[safeData.length - 6] : latest;
    const calcTrend = (key) => latest[key] !== undefined && pastReading[key] !== undefined ? (latest[key] - pastReading[key]) : null;

    const fmt = (val) => (val !== undefined && val !== null) ? Number(val).toFixed(1) : 'Nill';

    // Baghouse Constraints logic
    let healthStatus = { state: 'HEALTHY', msg: 'System performing optimally', color: 'bg-green-500/10 text-green-500 border-green-500/20' };
    if (latest.diff_pressure > 150) {
        healthStatus = { state: 'CRITICAL', msg: 'Bag Blinding Risk! Immediate pulse-cleaning check required.', color: 'bg-red-500/10 text-red-500 border-red-500/50 animate-pulse' };
    } else if (latest.diff_pressure > 120) {
        healthStatus = { state: 'WARNING', msg: 'Elevated Differential Pressure', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' };
    }

    const handleDownload = async () => {
        if (safeData.length === 0) return alert("System currently in standby.");
        try {
            const response = await fetch(`${API_BASE_URL}/api/export/${nodeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
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

    return (
        <div className={`rounded-3xl overflow-hidden border shadow-xl flex flex-col ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg text-white shadow-sm ${isPlaceholder ? 'bg-slate-500' : 'bg-blue-600'}`}><Cpu size={20} /></div>
                    <h3 className="font-bold text-lg">{nodeId}</h3>
                </div>
                <div className="flex bg-slate-800/10 rounded-lg p-1">
                    <button onClick={() => setTab('overview')} className={`px-3 py-1 rounded-md text-xs font-bold transition shadow-sm ${tab === 'overview' ? 'bg-blue-600 text-white' : 'opacity-50 hover:opacity-100'}`}>Overview</button>
                    <button onClick={() => setTab('analytics')} className={`px-3 py-1 rounded-md text-xs font-bold transition shadow-sm ${tab === 'analytics' ? 'bg-blue-600 text-white' : 'opacity-50 hover:opacity-100'}`}>Diagnostics</button>
                </div>
            </div>

            {/* Dynamic System Health Banner */}
            {!isPlaceholder && (
                <div className={`px-6 py-2 border-b flex items-center gap-2 text-xs font-bold ${healthStatus.color} ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                    {healthStatus.state === 'HEALTHY' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{healthStatus.state}: {healthStatus.msg}</span>
                </div>
            )}

            <div className="flex-1">
                {tab === 'overview' ? (
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <MiniMetric label="Diff Pressure" value={fmt(latest.diff_pressure)} unit="mmWC" icon={<Wind />} color="text-blue-500" bg="bg-blue-500/5" progress={(latest.diff_pressure / 160) * 100} trend={calcTrend('diff_pressure')} theme={theme} />
                            <MiniMetric label="Header Pressure" value={fmt(latest.header_pressure)} unit="Bar" icon={<Gauge />} color="text-cyan-500" bg="bg-cyan-500/5" progress={(latest.header_pressure / 10) * 100} trend={calcTrend('header_pressure')} theme={theme} />
                            <MiniMetric label="Inlet Temp" value={fmt(latest.inlet_temp)} unit="°C" icon={<Thermometer />} color="text-orange-500" bg="bg-orange-500/5" progress={(latest.inlet_temp / 250) * 100} trend={calcTrend('inlet_temp')} theme={theme} />
                            <MiniMetric label="Outlet Temp" value={fmt(latest.outlet_temp)} unit="°C" icon={<Thermometer />} color="text-yellow-500" bg="bg-yellow-500/5" progress={(latest.outlet_temp / 250) * 100} trend={calcTrend('outlet_temp')} theme={theme} />
                            <MiniMetric label="Emissions (PM)" value={fmt(latest.pm_level)} unit="mg" icon={<Droplets />} color="text-purple-500" bg="bg-purple-500/5" progress={(latest.pm_level / 50) * 100} trend={calcTrend('pm_level')} theme={theme} />
                            <MiniMetric label="Cleaning Cycle" value={latest.cleaning_status ? "ACTIVE" : "OFF"} unit="" icon={<Layers />} color={latest.cleaning_status ? "text-green-500" : "text-slate-400"} bg="bg-slate-500/5" theme={theme} />
                        </div>
                        <div className="h-28">
                            <p className="text-[10px] font-bold opacity-40 mb-1 uppercase tracking-wider pl-2">Live ΔP Stream</p>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={safeData.slice(-30)}>
                                    <Area type="monotone" dataKey="diff_pressure" stroke={isPlaceholder ? "#94a3b8" : "#3b82f6"} fill={isPlaceholder ? "#94a3b8" : "#3b82f6"} fillOpacity={0.1} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        <CorrelatedChart data={safeData} theme={theme} />
                        <div className="grid grid-cols-2 gap-4">
                            <AnalyticsChart label="TEMPERATURE PROFILE" data={safeData} dataKey="inlet_temp" color="#f97316" theme={theme} />
                            <AnalyticsChart label="SIGNAL (RSSI)" data={safeData} dataKey="rssi" color="#6366f1" isBar theme={theme} />
                        </div>
                    </div>
                )}
            </div>
            <div className={`p-4 border-t grid grid-cols-2 gap-3 mt-auto ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                <button onClick={handleDownload} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition shadow-sm ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}`}><Download size={16} /> Logs Export</button>
                <button className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition shadow-sm border border-red-500/20 hover:border-transparent"><Power size={16} /> EMERGENCY HOLD</button>
            </div>
        </div>
    );
};

export default NodeCard;
