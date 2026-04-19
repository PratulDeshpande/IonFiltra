import React from 'react';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';

const LocationSelector = () => {
    const { selectLocation } = useApp();

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4" style={{backgroundColor: '#0f172a'}}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 sm:mb-10 text-center">Select Facility</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 w-full max-w-7xl px-2 sm:px-6">
                {['Pune', 'Mumbai', 'Nashik'].map((city) => (
                    <button 
                        key={city} 
                        onClick={() => selectLocation(city)} 
                        className={`p-6 sm:p-8 rounded-3xl border transition ${city === 'Pune' ? 'border-blue-500/50 bg-blue-900/20 hover:bg-blue-900/40' : 'border-white/5 bg-slate-800 opacity-50 hover:opacity-100'}`}
                    >
                        <MapPin size={32} className={`mx-auto mb-3 sm:mb-4 ${city === 'Pune' ? 'text-blue-500' : 'text-slate-400'}`} />
                        <h3 className="text-xl sm:text-2xl font-bold text-center">{city} HQ</h3>
                        {city !== 'Pune' && <p className="text-xs text-red-500 mt-2">Offline</p>}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default LocationSelector;
