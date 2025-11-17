'use client';
import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Chat() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const typingIntervals = useRef<Array<ReturnType<typeof setInterval>>>([]);
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioEnabledRef = useRef(true);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Load chat history from localStorage
    const saved = localStorage.getItem('awg_chat_history');
    if (saved) {
      setChatHistory(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    return () => {
      typingIntervals.current.forEach(clearInterval);
      typingIntervals.current = [];
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
      if (synthRef.current?.speaking) {
        synthRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    if (!audioEnabled && synthRef.current?.speaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }, [audioEnabled]);

  const showActionFeedback = (message: string) => {
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
    }
    setActionMessage(message);
    actionTimeoutRef.current = setTimeout(() => setActionMessage(null), 2000);
  };

  const copyText = async (
    text: string,
    messages: { missingMessage: string; successMessage: string }
  ) => {
    if (!text) {
      showActionFeedback(messages.missingMessage);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      showActionFeedback('Clipboard unavailable');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showActionFeedback(messages.successMessage);
    } catch {
      showActionFeedback('Copy failed');
    }
  };

  const copyPreviousPrompt = () =>
    copyText(lastPrompt, {
      missingMessage: 'No previous prompt to copy',
      successMessage: 'Prompt copied to clipboard'
    });

  const copyLastResponse = () =>
    copyText(lastResponse, {
      missingMessage: 'No response available to copy',
      successMessage: 'Response copied to clipboard'
    });

  const logConversation = async (userText: string, botText: string, context: any) => {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      return;
    }

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMsg: userText, aiReply: botText, context })
      });
    } catch (error) {
      console.error('Failed to log chat conversation', error);
    }
  };

  const handleSpeak = (text?: string) => {
    const content = text ?? lastResponse;

    if (!audioEnabledRef.current) {
      showActionFeedback('Audio narration is muted');
      return;
    }

    if (!content) {
      showActionFeedback('No response available for narration');
      return;
    }

    const synth = synthRef.current;
    if (!synth) {
      showActionFeedback('Speech synthesis is not supported in this browser');
      return;
    }

    if (synth.speaking) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
      showActionFeedback('Unable to play audio');
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
  };

  const toggleAudio = () => {
    setAudioEnabled(prev => {
      const next = !prev;
      if (!next && synthRef.current?.speaking) {
        synthRef.current.cancel();
        utteranceRef.current = null;
        setIsSpeaking(false);
      }
      showActionFeedback(next ? 'Audio narration enabled' : 'Audio narration muted');
      return next;
    });
  };

  const stopNarration = () => {
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
      utteranceRef.current = null;
      setIsSpeaking(false);
      showActionFeedback('Audio stopped');
    }
  };

  const resendLastExchange = () => {
    if (!lastPrompt || !lastResponse) {
      showActionFeedback('No previous exchange to resend');
      return;
    }

    const compiled = `Previous question: ${lastPrompt}\nPrevious response: ${lastResponse}\nUsing the latest sensor readings, provide an updated answer.`;
    stopNarration();
    showActionFeedback('Re-sending with previous exchange');
    void send(compiled);
  };

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

    setChatHistory(prev => {
      const filtered = prev.filter(c => c.id !== chatId);
      const updated = [newChat, ...filtered].slice(0, 20);
      localStorage.setItem('awg_chat_history', JSON.stringify(updated));
      return updated;
    });
    setCurrentChatId(chatId);
  };

  const loadChat = (chat: any) => {
    typingIntervals.current.forEach(clearInterval);
    typingIntervals.current = [];
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
    setMsgs(chat.messages);
    setCurrentChatId(chat.id);
    setActionMessage(null);
    const reversed = [...chat.messages].reverse();
    const lastUserMsg = reversed.find(m => m.role === 'user');
    const lastBotMsg = reversed.find(m => m.role === 'bot');
    setLastPrompt(lastUserMsg?.text || '');
    setLastResponse(lastBotMsg?.text || '');
  };

  const newChat = () => {
    typingIntervals.current.forEach(clearInterval);
    typingIntervals.current = [];
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
    setMsgs([]);
    setCurrentChatId(null);
    setLastPrompt('');
    setLastResponse('');
    setActionMessage(null);
  };

  const deleteChat = (id: string) => {
    const updated = chatHistory.filter(c => c.id !== id);
    const trimmed = updated.slice(0, 20);
    setChatHistory(trimmed);
    localStorage.setItem('awg_chat_history', JSON.stringify(trimmed));
    if (currentChatId === id) {
      newChat();
    }
  };

  const send = async (overrideMessage?: string) => {
    if (loading) return;

    const outgoingRaw = overrideMessage ?? input;
    const message = outgoingRaw.trim();
    if (!message) return;

    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);

    const userMsg = { role: 'user', text: message };
    const updatedMsgs = [...msgs, userMsg];
    setMsgs(updatedMsgs);
    setInput('');
    setLoading(true);
    setLastPrompt(message);

    const animateBotReply = (
      fullText: string,
      baseMessages: any[],
      userText: string,
      context: any
    ) => {
      const id = `bot-${Date.now()}`;
      const initial = [...baseMessages, { role: 'bot', text: '', id }];
      setMsgs(initial);

      let index = 0;
      const interval = setInterval(() => {
        index += 1;
        setMsgs(prev => {
          const next = prev.map(msg =>
            msg.id === id ? { ...msg, text: fullText.slice(0, index) } : msg
          );
          if (index >= fullText.length) {
            clearInterval(interval);
            typingIntervals.current = typingIntervals.current.filter(t => t !== interval);
            const final = next.map(msg => {
              if (msg.id === id) {
                const { id: _id, ...rest } = msg;
                return rest;
              }
              if ('id' in msg) {
                const { id: _omit, ...rest } = msg as any;
                return rest;
              }
              return msg;
            });
            setTimeout(() => {
              setLastResponse(fullText);
              if (audioEnabledRef.current) {
                handleSpeak(fullText);
              }
              saveToHistory(final);
              if (userText) {
                void logConversation(userText, fullText, context);
              }
            }, 0);
            return final;
          }
          return next;
        });
      }, 15);
      typingIntervals.current.push(interval);
    };

    try {
      const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Groq API key');
      }

      const contextRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/ai/context`);
      if (!contextRes.ok) {
        throw new Error('Failed to fetch AWG data');
      }
      const contextData = await contextRes.json();

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are the AWG Assistant. You receive the latest Atmospheric Water Generator sensor data as JSON: ${JSON.stringify(contextData)}.

Response rules:
- If the user greets you (hi, hello, hey, good morning, etc.) without another request, respond with a brief friendly introduction like "Hello! I'm the AWG Assistant, ready to help with your Atmospheric Water Generator." Do not mention sensor readings in that case.
- For any other question, answer in a single concise paragraph using Markdown without tables.
- Whenever you reference specific metrics or system insights, clearly state they are based on the latest sensor readings.
- Mention only the metrics needed to address the prompt and describe them in plain language.
- Politely refuse topics that are not related to the AWG system.`
            },
            { role: 'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 400,
          top_p: 1
        })
      });

      if (!res.ok) {
        throw new Error('Groq request failed');
      }

      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'No response';
      animateBotReply(reply, updatedMsgs, message, contextData);
    } catch (error) {
      const errMsg = { role: 'bot', text: error instanceof Error ? error.message : 'Error connecting to AI' };
      const withError = [...updatedMsgs, errMsg];
      setMsgs(withError);
      saveToHistory(withError);
      setLastResponse(errMsg.text);
      showActionFeedback(errMsg.text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
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

  <div className="flex-1 flex flex-col overflow-hidden">
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
                    <p className={`text-sm leading-relaxed ${m.role === 'bot' ? 'whitespace-pre-line' : ''}`}>{m.text}</p>
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
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <button
                type="button"
                onClick={copyPreviousPrompt}
                className="px-3 py-1.5 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
                disabled={!lastPrompt}
              >
                Copy last prompt
              </button>
              <button
                type="button"
                onClick={copyLastResponse}
                className="px-3 py-1.5 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
                disabled={!lastResponse}
              >
                Copy response
              </button>
              <button
                type="button"
                onClick={toggleAudio}
                className="px-3 py-1.5 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
              >
                {audioEnabled ? 'Mute audio' : 'Enable audio'}
              </button>
              <button
                type="button"
                onClick={() => handleSpeak()}
                className="px-3 py-1.5 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
                disabled={!audioEnabled || !lastResponse}
              >
                Play response audio
              </button>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={stopNarration}
                  className="px-3 py-1.5 border border-gray-300 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                >
                  Stop audio
                </button>
              )}
              <button
                type="button"
                onClick={resendLastExchange}
                className="px-3 py-1.5 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
                disabled={!lastPrompt || !lastResponse || loading}
              >
                Resend last exchange
              </button>
              {actionMessage && (
                <span className="text-gray-500">{actionMessage}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !loading) {
                      void send();
                    }
                  }
                }}
                placeholder="Message AWG Assistant... (Press Enter to send)"
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-full focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900 text-sm text-gray-900 transition-all"
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="p-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all hover:scale-110 active:scale-95"
                title="Send message (Enter)"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              💡 Tip: Press <kbd className="px-2 py-1 bg-gray-200 rounded font-mono text-xs">Enter</kbd> to send your message
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
