import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const Auth = () => {
    const { login } = useApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        await login(username, password);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 sm:p-0" style={{backgroundColor: '#0f172a'}}>
            <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-8 rounded-3xl border border-white/10 bg-slate-800 shadow-2xl mx-auto">
                <h1 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">IONFILTRA <span className="text-blue-500">IOT</span></h1>
                <form onSubmit={handleLogin} className="space-y-4">
                    <input 
                        type="text" 
                        placeholder="Operator ID" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500" 
                        required
                    />
                    <input 
                        type="password" 
                        placeholder="Access Key" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500" 
                        required
                    />
                    <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">
                        SECURE LOGIN
                    </button>
                    <p className="text-xs text-center opacity-50 mt-4">For demo: Any Operator ID + password 'admin'</p>
                </form>
            </div>
        </div>
    );
};

export default Auth;
