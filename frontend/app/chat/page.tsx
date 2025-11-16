'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Chat() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    // Load chat history from localStorage
    const saved = localStorage.getItem('awg_chat_history');
    if (saved) {
      setChatHistory(JSON.parse(saved));
    }
  }, []);

  const saveToHistory = (messages: any[]) => {
    if (messages.length === 0) return;
    
    const chatId = currentChatId || Date.now().toString();
    const title = messages[0]?.text?.substring(0, 30) || 'New Chat';
    
    const newChat = {
      id: chatId,
      title,
      messages,
      timestamp: Date.now()
    };

    const updated = chatHistory.filter(c => c.id !== chatId);
    updated.unshift(newChat);
    
    setChatHistory(updated.slice(0, 20)); // Keep last 20 chats
    localStorage.setItem('awg_chat_history', JSON.stringify(updated.slice(0, 20)));
    setCurrentChatId(chatId);
  };

  const loadChat = (chat: any) => {
    setMsgs(chat.messages);
    setCurrentChatId(chat.id);
  };

  const newChat = () => {
    setMsgs([]);
    setCurrentChatId(null);
  };

  const deleteChat = (id: string) => {
    const updated = chatHistory.filter(c => c.id !== id);
    setChatHistory(updated);
    localStorage.setItem('awg_chat_history', JSON.stringify(updated));
    if (currentChatId === id) {
      newChat();
    }
  };

  const send = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', text: input };
    const updatedMsgs = [...msgs, userMsg];
    setMsgs(updatedMsgs);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });

      const json = await res.json();
      const botMsg = { 
        role: 'bot', 
        text: json.response || 'No response',
        data: json.data 
      };
      const finalMsgs = [...updatedMsgs, botMsg];
      setMsgs(finalMsgs);
      saveToHistory(finalMsgs);
    } catch {
      const errMsg = { role: 'bot', text: 'Error connecting to AI' };
      const finalMsgs = [...updatedMsgs, errMsg];
      setMsgs(finalMsgs);
      saveToHistory(finalMsgs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      <Sidebar />
      
      {/* Chat History Sidebar */}
      {showHistory && (
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={newChat}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {chatHistory.length === 0 ? (
              <p className="text-gray-500 text-xs text-center p-4">No previous chats</p>
            ) : (
              <div className="space-y-1">
                {chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      currentChatId === chat.id ? 'bg-gray-200' : 'hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <div className="flex-1 min-w-0" onClick={() => loadChat(chat)}>
                      <p className="text-xs text-gray-900 truncate font-medium">{chat.title}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                    >
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-base font-semibold text-gray-900">AWG Assistant</h1>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {msgs.length === 0 ? (
            <div className="flex items-center justify-center h-full p-4">
              <div className="text-center max-w-2xl">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Assistant with Full System Access</h2>
                  <p className="text-gray-500 text-sm">I can analyze all your data - ask me anything!</p>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <button
                    onClick={() => { setInput("Show me system status overview"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">📊 System Overview</div>
                    <div className="text-xs text-gray-600 mt-1">Complete status with all metrics</div>
                  </button>
                  <button
                    onClick={() => { setInput("When will the bottle be full?"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">⏱️ Fill Time Prediction</div>
                    <div className="text-xs text-gray-600 mt-1">Estimate when water will be ready</div>
                  </button>
                  <button
                    onClick={() => { setInput("Is the water safe to drink?"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">✨ Water Quality Check</div>
                    <div className="text-xs text-gray-600 mt-1">Check TDS levels and safety</div>
                  </button>
                  <button
                    onClick={() => { setInput("Give me recommendations"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">💡 Smart Tips</div>
                    <div className="text-xs text-gray-600 mt-1">AI-powered recommendations</div>
                  </button>
                  <button
                    onClick={() => { setInput("Show production history"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">📈 History Analysis</div>
                    <div className="text-xs text-gray-600 mt-1">Review all past sessions</div>
                  </button>
                  <button
                    onClick={() => { setInput("Any alerts or problems?"); }}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900">⚠️ Alert Monitor</div>
                    <div className="text-xs text-gray-600 mt-1">Check for system warnings</div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-6 px-4">
              {msgs.map((m, i) => (
                <div key={i} className={`flex gap-3 mb-6 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'bot' && (
                    <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[80%] ${
                    m.role === 'user' 
                      ? 'bg-gray-900 text-white px-4 py-2.5 rounded-2xl rounded-br-md' 
                      : 'text-gray-900'
                  }`}>
                    <p className="text-sm leading-relaxed">{m.text}</p>
                  </div>
                  {m.role === 'user' && (
                    <div className="w-7 h-7 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 mb-6">
                  <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex gap-1 pt-3">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message AWG Assistant..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:border-gray-500 text-sm text-gray-900"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="p-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
