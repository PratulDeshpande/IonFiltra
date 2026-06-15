import React from 'react';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';

const LocationSelector = () => {
    const { selectLocation, facilities } = useApp();

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4" style={{backgroundColor: '#0f172a'}}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 sm:mb-10 text-center">Select Facility</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 w-full max-w-7xl px-2 sm:px-6">
                {facilities.map((fac) => (
                    <button 
                        key={fac.id} 
                        onClick={() => selectLocation(fac)} 
                        className={`p-6 sm:p-8 rounded-3xl border transition ${fac.status === 'online' ? 'border-blue-500/50 bg-blue-900/20 hover:bg-blue-900/40' : 'border-white/5 bg-slate-800 opacity-50 hover:opacity-100'}`}
                    >
                        <MapPin size={32} className={`mx-auto mb-3 sm:mb-4 ${fac.status === 'online' ? 'text-blue-500' : 'text-slate-400'}`} />
                        <h3 className="text-xl sm:text-2xl font-bold text-center">{fac.name}</h3>
                        {fac.status !== 'online' && <p className="text-xs text-red-500 mt-2">Offline</p>}
                    </button>
                ))}
                {facilities.length === 0 && <p className="text-slate-400 col-span-full text-center">No facilities found. Contact your administrator.</p>}
            </div>
        </div>
    );
};

export default LocationSelector;
