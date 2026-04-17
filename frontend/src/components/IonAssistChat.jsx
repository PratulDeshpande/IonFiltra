import React, { useState, useEffect, useRef } from 'react';
import { Bot, LogOut, Send, Plus, Maximize2, Minimize2, Trash2, Loader2, UploadCloud, FileText, Database } from 'lucide-react';
import { useApp } from '../context/AppContext';

const IonAssistChat = () => {
    const { theme, nodeDataMap, API_BASE_URL, token } = useApp();
    
    // Chat UI states
    const [chatOpen, setChatOpen] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isAiThinking, setIsAiThinking] = useState(false);
    const chatEndRef = useRef(null);

    // Document Management
    const [isUploading, setIsUploading] = useState(false);
    const [knownDocs, setKnownDocs] = useState([]);
    const fileInputRef = useRef(null);

    // Chat Session Management
    const [chatSessions, setChatSessions] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const isInitialized = useRef(false);

    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const savedSessions = localStorage.getItem('ion_chat_sessions');
        let initialSessions = [];
        if (savedSessions) {
            try { initialSessions = JSON.parse(savedSessions); } catch(e) {}
        }

        if (initialSessions.length > 0) {
            setChatSessions(initialSessions);
            setCurrentSessionId(initialSessions[0].id);
            setChatMessages(initialSessions[0].messages);
        } else {
            createInitialSession();
        }
        
        fetchKnowledgeBase();
    }, []);

    useEffect(() => {
        if(chatSessions.length > 0) {
            localStorage.setItem('ion_chat_sessions', JSON.stringify(chatSessions));
        }
    }, [chatSessions]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages, isAiThinking, chatOpen, isChatExpanded]);

    const fetchKnowledgeBase = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/knowledge`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setKnownDocs(data.files || []);
            }
        } catch(e) {
            console.error("Failed to fetch knowledge base", e);
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('document', file);

        try {
            const res = await fetch(`${API_BASE_URL}/api/upload_knowledge`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                // Refresh list
                await fetchKnowledgeBase();
                
                // Add a notification directly into the chat
                const updatedMessages = [...chatMessages, { role: 'ai', text: `✅ I have analyzed and memorized: **${file.name}**. You can now ask me questions about it.` }];
                updateCurrentSession(updatedMessages);
            } else {
                alert("Upload failed: " + data.error);
            }
        } catch(e) {
            alert("Error uploading document: " + e.message);
        } finally {
            setIsUploading(false);
            if(fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const createInitialSession = () => {
        const newId = Date.now();
        const newSession = {
            id: newId,
            title: 'New Conversation',
            timestamp: new Date().toISOString(),
            messages: [{ role: 'ai', text: '👋 Hi! I am Ion Assist (Powered by Google Gemini RAG). How can I help you analyze the sensor data or manuals?' }]
        };
        setChatSessions([newSession]);
        setCurrentSessionId(newId);
        setChatMessages(newSession.messages);
    };

    const createNewSession = () => {
        const current = chatSessions.find(s => s.id === currentSessionId);
        if (current && current.messages.length <= 1 && current.title === 'New Conversation') return;

        const newId = Date.now();
        const newSession = {
            id: newId,
            title: 'New Conversation',
            timestamp: new Date().toISOString(),
            messages: [{ role: 'ai', text: '👋 New Session. Ask me about real-time anomalies or uploaded specs.' }]
        };
        setChatSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newId);
        setChatMessages(newSession.messages);
    };

    const switchSession = (id) => {
        const session = chatSessions.find(s => s.id === id);
        if (session) {
            setCurrentSessionId(id);
            setChatMessages(session.messages);
        }
    };

    const deleteSession = (e, id) => {
        e.stopPropagation();
        const updated = chatSessions.filter(s => s.id !== id);
        setChatSessions(updated);
        localStorage.setItem('ion_chat_sessions', JSON.stringify(updated));
        if (updated.length === 0) createInitialSession();
        else if (id === currentSessionId) {
            setCurrentSessionId(updated[0].id);
            setChatMessages(updated[0].messages);
        }
    };

    const updateCurrentSession = (newMessages) => {
        setChatMessages(newMessages);
        setChatSessions(prev => prev.map(session => {
            if (session.id === currentSessionId) {
                let title = session.title;
                if (title === 'New Conversation' && newMessages.length > 1) {
                    const firstUserMsg = newMessages.find(m => m.role === 'user');
                    if (firstUserMsg) title = firstUserMsg.text.length > 25 ? firstUserMsg.text.slice(0, 25) + '...' : firstUserMsg.text;
                }
                return { ...session, messages: newMessages, title };
            }
            return session;
        }));
    };

    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const userMsg = chatInput;
        const updatedMessages = [...chatMessages, { role: 'user', text: userMsg }];
        updateCurrentSession(updatedMessages);
        setChatInput('');
        setIsAiThinking(true);

        const activeNodes = Object.keys(nodeDataMap);
        const targetNodeId = activeNodes.find(id => userMsg.toLowerCase().includes(id.toLowerCase()));
        let contextData = targetNodeId ? { target: targetNodeId, history: (nodeDataMap[targetNodeId] || []).slice(-5) } : { type: "system_summary", readings: nodeDataMap };

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ message: userMsg, contextData })
            });
            const data = await response.json();
            setIsAiThinking(false);
            updateCurrentSession([...updatedMessages, { role: 'ai', text: data.reply }]);
        } catch (err) {
            setIsAiThinking(false);
            updateCurrentSession([...updatedMessages, { role: 'ai', text: "⚠️ Server connection failed or timeout." }]);
        }
    };

    return (
        <div className={`fixed transition-all duration-300 z-50 ${isChatExpanded ? 'inset-0 w-full h-full' : 'bottom-8 right-8 flex flex-col items-end'}`}>
            {chatOpen && (
                <div className={`flex ${isChatExpanded ? 'flex-row h-full rounded-none' : 'flex-col w-96 h-[650px] mb-4 rounded-3xl'} border shadow-2xl overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                    {isChatExpanded && (
                        <div className={`w-80 flex-shrink-0 flex flex-col border-r ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            {/* History Section */}
                            <div className="flex-1 overflow-hidden flex flex-col border-b border-slate-800/50">
                                <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                                    <span className="font-bold text-xs uppercase tracking-widest opacity-50">History</span>
                                    <button onClick={createNewSession} className="text-blue-500 p-1"><Plus size={18}/></button>
                                </div>
                                <div className="p-2 space-y-1 overflow-y-auto flex-1">
                                    {chatSessions.map(s => (
                                        <div key={s.id} onClick={()=>switchSession(s.id)} className={`p-3 rounded-xl text-sm cursor-pointer flex justify-between items-center ${currentSessionId === s.id ? 'bg-blue-600/10 text-blue-500' : 'opacity-60 hover:opacity-100'}`}>
                                            <span className="truncate pr-2">{s.title}</span>
                                            <button onClick={(e)=>deleteSession(e, s.id)} className="hover:text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Knowledge Base RAG Sidebar */}
                            <div className="h-1/3 min-h-[200px] flex flex-col">
                                <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                                    <span className="font-bold text-xs uppercase tracking-widest opacity-50 flex items-center gap-2"><Database size={14}/> DB Knowledge</span>
                                </div>
                                <div className="p-3 overflow-y-auto flex-1 space-y-2">
                                    {knownDocs.length === 0 ? (
                                        <p className="text-xs opacity-40 text-center mt-4">No PDFs/Datasheets uploaded yet.</p>
                                    ) : (
                                        knownDocs.map((doc, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-800/20 opacity-80 border border-slate-700/50">
                                                <FileText size={12} className="text-blue-400 flex-shrink-0" />
                                                <span className="truncate flex-1">{doc.original_name}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="p-4 border-t border-slate-800/50">
                                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.csv,.md" onChange={handleFileUpload} />
                                    <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`w-full py-2 flex items-center justify-center gap-2 text-sm font-bold rounded-xl transition ${isUploading ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed' : 'bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white'}`}>
                                        {isUploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                        {isUploading ? "Processing..." : "Add Context File"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2"><Bot size={20}/> <span className="font-bold text-sm">ION ASSIST (Gemini RAG)</span></div>
                            <div className="flex items-center gap-2">
                                <button onClick={createNewSession}><Plus size={18}/></button>
                                <button onClick={()=>setIsChatExpanded(!isChatExpanded)}>{isChatExpanded ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
                                <button onClick={()=>setChatOpen(false)}><LogOut size={18} className="rotate-180"/></button>
                            </div>
                        </div>
                        
                        {/* Mobile upload header if not expanded */}
                        {!isChatExpanded && (
                            <div className={`p-2 px-4 border-b flex justify-between items-center text-xs ${theme==='dark' ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                                <span className="opacity-60 flex items-center gap-1"><Database size={10}/> {knownDocs.length} PDFs Loaded</span>
                                <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf, text/plain" onChange={handleFileUpload} />
                                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="text-blue-500 hover:underline flex items-center gap-1">
                                     {isUploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                                     {isUploading ? "Uploading..." : "Add File"}
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {chatMessages.map((m, i) => (
                                <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                                    <div className={`p-3 rounded-2xl max-w-[85%] text-sm whitespace-pre-wrap ${m.role==='user' ? 'bg-blue-600 text-white' : (theme==='dark' ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-slate-200 text-slate-800')}`}>
                                        {m.text}
                                    </div>
                                </div>
                            ))}
                            {isAiThinking && <div className="text-xs opacity-50 animate-pulse flex items-center gap-2"><Loader2 size={12} className="animate-spin"/> Parsing telemetry & documents...</div>}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleChat} className={`p-4 border-t flex gap-2 ${theme==='dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                            <input 
                                className="flex-1 bg-transparent text-sm outline-none" 
                                placeholder="Query telemetry or uploaded PDFs..." 
                                value={chatInput} 
                                onChange={e=>setChatInput(e.target.value)}
                                disabled={isUploading || isAiThinking}
                            />
                            <button type="submit" className="text-blue-500 hover:text-blue-400 transition" disabled={isAiThinking || isUploading}><Send size={20}/></button>
                        </form>
                    </div>
                </div>
            )}
            {!isChatExpanded && (
                <button 
                    onClick={() => setChatOpen(!chatOpen)} 
                    className="w-16 h-16 rounded-full shadow-2xl flex items-center justify-center bg-blue-600 text-white hover:scale-105 transition-transform"
                >
                    <Bot size={32}/>
                </button>
            )}
        </div>
    );
};

export default IonAssistChat;
