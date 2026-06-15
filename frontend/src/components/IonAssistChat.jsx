import React, { useState, useEffect, useRef } from 'react';
import { Bot, LogOut, Send, Plus, Maximize2, Minimize2, Trash2, Loader2, Paperclip, FileText, Database, ChevronRight, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const IonAssistChat = () => {
    const { theme, nodeDataMap, API_BASE_URL, token } = useApp();

    // Chat UI states
    const [chatOpen, setChatOpen] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isAiThinking, setIsAiThinking] = useState(false);
    const chatEndRef = useRef(null);
    const textareaRef = useRef(null);

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
            try { initialSessions = JSON.parse(savedSessions); } catch (e) { }
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
        if (chatSessions.length > 0) {
            localStorage.setItem('ion_chat_sessions', JSON.stringify(chatSessions));
        }
    }, [chatSessions]);

    useEffect(() => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 50);
    }, [chatMessages, isAiThinking, chatOpen, isChatExpanded]);

    const fetchKnowledgeBase = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/knowledge`, {
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setKnownDocs(data.files || []);
            }
        } catch (e) {
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
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                await fetchKnowledgeBase();
                const updatedMessages = [...chatMessages, { role: 'ai', text: `✅ Successfully analyzed: **${file.name}**. It is now in my knowledge base.` }];
                updateCurrentSession(updatedMessages);
            } else {
                alert("Upload failed: " + data.error);
            }
        } catch (e) {
            alert("Error uploading document: " + e.message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const createInitialSession = () => {
        const newId = Date.now();
        const newSession = {
            id: newId,
            title: 'New Conversation',
            timestamp: new Date().toISOString(),
            messages: [{ role: 'ai', text: '👋 Hi! I am Ion Assist (Powered by Google Gemini). How can I help you analyze sensor data or manuals?' }]
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
        e?.preventDefault();
        if (!chatInput.trim()) return;

        const userMsg = chatInput;
        setChatInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset height
        }

        const updatedMessages = [...chatMessages, { role: 'user', text: userMsg }];
        updateCurrentSession(updatedMessages);
        setIsAiThinking(true);

        const activeNodes = Object.keys(nodeDataMap || {});
        const targetNodeId = activeNodes.find(id => userMsg.toLowerCase().includes(id.toLowerCase()));
        let contextData = targetNodeId ? { target: targetNodeId, history: (nodeDataMap[targetNodeId] || []).slice(-5) } : { type: "system_summary", readings: nodeDataMap };

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({ message: userMsg, contextData })
            });
            const data = await response.json();
            setIsAiThinking(false);
            if (data.reply) {
                updateCurrentSession([...updatedMessages, { role: 'ai', text: data.reply }]);
            } else {
                updateCurrentSession([...updatedMessages, { role: 'ai', text: "⚠️ Expected a reply, but none was received." }]);
            }
        } catch (err) {
            setIsAiThinking(false);
            updateCurrentSession([...updatedMessages, { role: 'ai', text: "⚠️ Server connection failed or timeout." }]);
        }
    };

    return (
        <div className={`fixed transition-all duration-500 z-50 ease-in-out ${isChatExpanded ? 'inset-4 sm:inset-10 w-[calc(100%-1rem)] sm:w-[calc(100%-5rem)] h-[calc(100%-1rem)] sm:h-[calc(100%-5rem)]' : 'bottom-4 right-4 sm:bottom-8 sm:right-8 flex flex-col items-end pointer-events-none'}`}>

            <div className={`pointer-events-auto transition-all duration-500 transform origin-bottom-right ${chatOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'} ${isChatExpanded ? 'w-full h-full rounded-2xl' : 'w-[95vw] sm:w-[420px] h-[80vh] sm:h-[75vh] max-h-[750px] mb-4 rounded-3xl'} flex flex-col shadow-2xl overflow-hidden border backdrop-blur-md ${theme === 'dark' ? 'bg-slate-900/95 border-slate-700/60 shadow-slate-900/80' : 'bg-white/95 border-slate-200 shadow-slate-300/60'}`}>

                {/* Header */}
                <div className={`flex-shrink-0 p-3 sm:p-4 shrink-0 flex justify-between items-center z-10 transition-colors ${theme === 'dark' ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-blue-700 to-indigo-600 text-white'}`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`p-2 rounded-xl backdrop-blur-sm ${theme === 'dark' ? 'bg-blue-600/20 text-blue-400' : 'bg-white/20 text-white'}`}>
                            <Bot size={22} />
                        </div>
                        <div>
                            <h3 className={`font-bold text-sm tracking-wide ${theme === 'dark' ? 'text-slate-100' : 'text-white'}`}>Ion Assist</h3>
                            <p className={`text-[10px] flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-blue-100'}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                Gemini RAG Engine
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button onClick={createNewSession} className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white/20 text-white'}`} title="New Chat"><Plus size={18} /></button>
                        <button onClick={() => setIsChatExpanded(!isChatExpanded)} className={`hidden sm:block p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white/20 text-white'}`} title={isChatExpanded ? "Minimize" : "Expand"}>
                            {isChatExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        <button onClick={() => setChatOpen(false)} className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-red-500/20 text-slate-300 hover:text-red-400' : 'hover:bg-white/20 text-white'}`} title="Close Chat"><X size={18} /></button>
                    </div>
                </div>

                {/* Body Container */}
                <div className="flex flex-col sm:flex-row flex-1 min-h-0 relative">

                    {/* Sidebar (Expanded Text Context) */}
                    {isChatExpanded && (
                        <div className={`w-full sm:w-72 flex h-[35%] sm:h-full flex-shrink-0 flex-col sm:border-r border-b sm:border-b-0 transition-colors ${theme === 'dark' ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>

                            {/* Sessions History */}
                            <div className={`flex-1 overflow-y-auto border-b ${theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200'} custom-scrollbar`}>
                                <div className="p-4 sticky top-0 backdrop-blur-md z-10 flex items-center justify-between">
                                    <span className={`font-bold text-xs uppercase tracking-widest ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>History</span>
                                </div>
                                <div className="px-3 pb-4 space-y-1">
                                    {chatSessions.map(s => (
                                        <div key={s.id} onClick={() => switchSession(s.id)} className={`p-3 rounded-xl text-sm cursor-pointer flex justify-between items-center group transition-colors ${currentSessionId === s.id ? (theme === 'dark' ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-700 font-medium') : (theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200/50 text-slate-600')}`}>
                                            <span className="truncate pr-2">{s.title}</span>
                                            <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Knowledge Base */}
                            <div className="h-[40%] flex flex-col">
                                <div className="p-4 sticky top-0 backdrop-blur-md z-10 flex items-center gap-2">
                                    <Database size={14} className={theme === 'dark' ? 'text-slate-500' : 'text-slate-400'} />
                                    <span className={`font-bold text-xs uppercase tracking-widest ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Knowledge base</span>
                                </div>
                                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2 custom-scrollbar">
                                    {knownDocs.length === 0 ? (
                                        <div className={`text-center py-6 text-xs px-4 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>No PDF/Text files uploaded yet. Upload data to grant AI extra context.</div>
                                    ) : (
                                        knownDocs.map((doc, idx) => (
                                            <div key={idx} className={`flex items-center gap-2 text-xs p-2.5 rounded-xl border transition-colors ${theme === 'dark' ? 'bg-slate-800/40 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}>
                                                <FileText size={14} className="text-blue-500 flex-shrink-0" />
                                                <span className="truncate flex-1 font-medium">{doc.original_name}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main Chat Area */}
                    <div className="flex-1 flex flex-col min-w-0 h-full">

                        {/* Status bar for unexpanded mode */}
                        {!isChatExpanded && knownDocs.length > 0 && (
                            <div className={`px-4 py-2 flex-shrink-0 text-[10px] flex items-center gap-2 border-b ${theme === 'dark' ? 'bg-slate-800/80 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                <Database size={10} className="text-blue-500" /> {knownDocs.length} custom files active in context
                            </div>
                        )}

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar scroll-smooth">
                            {chatMessages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                                    <Bot size={48} className="mb-4 text-blue-500 opacity-50" />
                                    <p className="text-sm">Start a conversation with Ion Assist</p>
                                </div>
                            )}

                            {chatMessages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {m.role === 'ai' && (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mr-3 mt-auto mb-auto flex-shrink-0 shadow-sm">
                                            <Bot size={16} />
                                        </div>
                                    )}
                                    <div className={`p-3.5 px-4 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : (theme === 'dark' ? 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-bl-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm')}`}>
                                        {m.text}
                                    </div>
                                </div>
                            ))}

                            {/* Typing Indicator */}
                            {isAiThinking && (
                                <div className="flex justify-start">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mr-3 mt-auto mb-auto flex-shrink-0 shadow-sm">
                                        <Bot size={16} />
                                    </div>
                                    <div className={`p-4 rounded-2xl rounded-bl-sm border flex gap-1.5 items-center ${theme === 'dark' ? 'bg-slate-800 border-slate-700/50' : 'bg-white border-slate-100'}`}>
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} className="h-1" />
                        </div>

                        {/* Input Form */}
                        <div className={`p-3 sm:p-4 flex-shrink-0 border-t ${theme === 'dark' ? 'border-slate-800/80 bg-slate-900/90' : 'border-slate-200 bg-white/90'}`}>
                            <form onSubmit={handleChat} className={`flex items-end gap-2 p-1.5 pl-2 rounded-3xl border transition-all shadow-sm ${theme === 'dark' ? 'border-slate-700 bg-slate-800 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20' : 'border-slate-300 bg-slate-50 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/20'}`}>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className={`p-2 rounded-full transition-colors flex-shrink-0 ${theme === 'dark' ? 'text-slate-400 hover:text-blue-400 hover:bg-blue-500/20' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-500/10'}`}
                                    title="Upload Context Document"
                                >
                                    {isUploading ? <Loader2 size={18} className="animate-spin text-blue-500" /> : <Paperclip size={18} />}
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.csv,.md" onChange={handleFileUpload} />

                                <textarea
                                    ref={textareaRef}
                                    className={`flex-1 bg-transparent text-sm py-2.5 px-2 outline-none resize-none max-h-32 custom-scrollbar placeholder:opacity-50 ${theme === 'dark' ? 'text-white placeholder:text-slate-400' : 'text-slate-900 placeholder:text-slate-500'}`}
                                    rows="1"
                                    placeholder="Message Ion Assist..."
                                    value={chatInput}
                                    onChange={e => {
                                        setChatInput(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChat(e);
                                        }
                                    }}
                                    disabled={isUploading || isAiThinking}
                                />

                                <button
                                    type="submit"
                                    className={`p-2 mb-1 mr-1 rounded-full flex-shrink-0 transition-all ${chatInput.trim() && !isAiThinking && !isUploading ? 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105 shadow-md shadow-blue-500/20' : 'bg-slate-200 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500 cursor-not-allowed'}`}
                                    disabled={!chatInput.trim() || isAiThinking || isUploading}
                                >
                                    <Send size={16} className={chatInput.trim() ? 'ml-0.5' : ''} />
                                </button>
                            </form>
                            <div className="text-center mt-2.5">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Ion Assist can make mistakes. Verify important information.</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Floating Action Button */}
            {!chatOpen && (
                <button
                    onClick={() => setChatOpen(true)}
                    className="pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:scale-110 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-blue-500/30 group relative"
                >
                    <Bot size={28} className="group-hover:animate-pulse" />
                    {/* Unread badge logic could go here */}
                </button>
            )}
        </div>
    );
};

export default IonAssistChat;
