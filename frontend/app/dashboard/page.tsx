'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

interface Toast {
  id: number;
  message: string;
  level: string;
  timestamp: Date;
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [fillTime, setFillTime] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastAlertTimestamp, setLastAlertTimestamp] = useState<string | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [showDrinkModal, setShowDrinkModal] = useState(false);
  const [remainingLevel, setRemainingLevel] = useState(70);

  const fmt = (n: number, d: number = 1) => Number(n.toFixed(d));

  // Add toast notification
  const addToast = (message: string, level: string) => {
    const newToast: Toast = {
      id: Date.now(),
      message,
      level,
      timestamp: new Date()
    };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      removeToast(newToast.id);
    }, 3000);
  };

  // Remove toast manually
  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleDrink = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/drink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remainingLevel })
      });
      const result = await res.json();
      if (result.success) {
        setShowDrinkModal(false);
        addToast(`✅ ${result.message}`, 'success');
        // Refresh data immediately
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err) {
      console.error('Drink error:', err);
      addToast('❌ Failed to update water level', 'critical');
    }
  };

  useEffect(() => {
    const fetch1 = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/latest`);
        const json = await res.json();
        setData(json.sensor || json);
        
        // Only show NEW alerts as toasts (not historical ones)
        const newAlerts = json.alerts || [];
        if (newAlerts.length > 0) {
          // Check if this is a new alert by comparing timestamp
          const latestAlert = newAlerts[0];
          const latestTimestamp = new Date(latestAlert.timestamp).toISOString();
          
          if (lastAlertTimestamp !== latestTimestamp) {
            // This is a NEW alert - show it as toast
            addToast(latestAlert.message, latestAlert.level);
            setLastAlertTimestamp(latestTimestamp);
          }
        }
        setAlerts(newAlerts);
      } catch (err) {
        console.error(err);
      }
    };

    const fetch2 = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/predict/fillTime`);
        const json = await res.json();
        setFillTime(json);
      } catch (err) {
        console.error(err);
      }
    };

    const fetch3 = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/history?limit=1`);
        const json = await res.json();
        if (json.length > 0) {
          setHistory(json[0]);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetch1();
    fetch2();
    fetch3();
    const id = setInterval(() => {
      fetch1();
      fetch2();
      fetch3();
    }, 5000);

    return () => clearInterval(id);
  }, []);

  if (!data) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const isFull = data.waterLevel >= 100;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-xl shadow-2xl border-l-4 animate-slide-in flex items-start gap-3 ${
              toast.level === 'critical' ? 'bg-red-50 border-red-500' : 
              toast.level === 'low' ? 'bg-yellow-50 border-yellow-500' : 
              toast.level === 'success' ? 'bg-green-50 border-green-500' :
              'bg-blue-50 border-blue-500'
            }`}
          >
            <div className="flex-1">
              <p className={`font-bold text-sm mb-1 ${
                toast.level === 'critical' ? 'text-red-800' : 
                toast.level === 'low' ? 'text-yellow-800' : 
                toast.level === 'success' ? 'text-green-800' :
                'text-blue-800'
              }`}>
                {toast.message}
              </p>
              <p className="text-xs text-gray-600">
                {toast.timestamp.toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className={`text-xl font-bold hover:scale-125 transition-transform ${
                toast.level === 'critical' ? 'text-red-600 hover:text-red-800' : 
                toast.level === 'low' ? 'text-yellow-600 hover:text-yellow-800' : 
                toast.level === 'success' ? 'text-green-600 hover:text-green-800' :
                'text-blue-600 hover:text-blue-800'
              }`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-8 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">AWG Dashboard</h2>
              <p className="text-sm text-gray-900 font-medium">Track and monitor your water generation system</p>
            </div>
            <button
              onClick={() => setShowDrinkModal(true)}
              disabled={!data || data.waterLevel < 1}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-lg hover:shadow-xl"
            >
              🥤 <span>Drink Water</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 p-8">
          {/* Stats Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <p className="text-gray-900 text-sm font-semibold mb-2 uppercase tracking-wide">Water Level</p>
              <div className="flex items-center gap-2">
                <p className="text-4xl font-bold text-green-600">{data.waterLevel}%</p>
                {data.trend === 'increasing' && <span className="text-green-500 text-2xl">↑</span>}
                {data.trend === 'stable' && <span className="text-gray-900 text-2xl">→</span>}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mt-4">
                <div className="bg-gradient-to-r from-green-400 to-green-600 h-3 rounded-full transition-all duration-500" style={{width: `${data.waterLevel}%`}}></div>
              </div>
              {data.trend && <p className="text-xs text-gray-900 mt-2 capitalize font-medium">{data.trend}</p>}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <p className="text-gray-900 text-sm font-semibold mb-2 uppercase tracking-wide">Water Quality</p>
              <p className="text-4xl font-bold text-green-600">{fmt(data.tds, 0)} <span className="text-lg text-gray-900">ppm</span></p>
              <p className="text-sm text-gray-900 mt-3 font-medium">{data.tds > 100 ? '❌ Unsafe' : '✅ Safe to Drink'}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <p className="text-gray-900 text-sm font-semibold mb-2 uppercase tracking-wide">Battery</p>
              <p className="text-4xl font-bold text-gray-900">{fmt(data.battery, 0)}%</p>
              <p className="text-sm text-gray-900 mt-3 font-medium">
                {data.battery < 25 ? '⚠️ Charge needed' : '✅ Fully Charged'}
              </p>
            </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-900 text-sm mb-2 font-medium">
              {isFull ? 'Last Fill Time' : 'Estimated Fill Time'}
            </p>
            {isFull ? (
              history ? (
                <>
                  <p className="text-2xl font-bold text-green-600">
                    {Math.floor(history.fillDuration / 60)}h {history.fillDuration % 60}m
                  </p>
                  <p className="text-xs text-gray-900 mt-2 font-medium">Bottle Full ✅</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-green-600">Full ✅</p>
              )
            ) : (
              <>
                <p className="text-2xl font-bold text-green-600">{fillTime?.msg || '...'}</p>
                {fillTime?.prediction && (
                  <p className="text-xs text-gray-900 mt-2 font-medium">💡 {fillTime.prediction}</p>
                )}
                {fillTime?.suggestion && (
                  <p className="text-xs text-orange-600 mt-2 font-medium">⚠️ {fillTime.suggestion}</p>
                )}
                {fillTime?.avgFlowRate && (
                  <p className="text-xs text-gray-900 mt-1 font-medium">Avg flow: {fillTime.avgFlowRate} L/min</p>
                )}
              </>
            )}
          </div>
        </div>

          {/* Details Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Environmental Chart */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
              <h3 className="font-bold text-xl mb-6 text-gray-900 flex items-center gap-2">
                <span className="text-gray-700">🌡️</span> Environmental Data
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Humidity</span>
                    <span className="font-bold text-gray-900">{fmt(data.humidity, 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-400 to-blue-600 h-3 rounded-full transition-all duration-500"
                      style={{width: `${data.humidity}%`}}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Temperature</span>
                    <span className="font-bold text-gray-900">{fmt(data.temp, 1)}°C</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-orange-400 to-orange-600 h-3 rounded-full transition-all duration-500"
                      style={{width: `${Math.min((data.temp / 50) * 100, 100)}%`}}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Water Temp</span>
                    <span className="font-bold text-gray-900">{fmt(data.waterTemp, 1)}°C</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-cyan-400 to-cyan-600 h-3 rounded-full transition-all duration-500"
                      style={{width: `${Math.min((data.waterTemp / 40) * 100, 100)}%`}}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Production Chart */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
              <h3 className="font-bold text-xl mb-6 text-gray-900 flex items-center gap-2">
                <span className="text-gray-700">⚙️</span> Production Metrics
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Flow Rate</span>
                    <span className="font-bold text-gray-900">{fmt(data.flowRate, 2)} L/min</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-purple-400 to-purple-600 h-3 rounded-full transition-all duration-500"
                      style={{width: `${Math.min((data.flowRate / 1) * 100, 100)}%`}}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Water Quality (TDS)</span>
                    <span className="font-bold text-gray-900">{fmt(data.tds, 0)} ppm</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-3 rounded-full transition-all duration-500 ${
                        data.tds > 100 ? 'bg-gradient-to-r from-red-400 to-red-600' : 'bg-gradient-to-r from-green-400 to-green-600'
                      }`}
                      style={{width: `${Math.min((data.tds / 200) * 100, 100)}%`}}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{data.tds > 100 ? 'Unsafe' : 'Safe'}</p>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium text-sm">Battery</span>
                    <span className="font-bold text-gray-900">{fmt(data.battery, 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-3 rounded-full transition-all duration-500 ${
                        data.battery < 25 ? 'bg-gradient-to-r from-red-400 to-red-600' : 
                        data.battery < 50 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                        'bg-gradient-to-r from-green-400 to-green-600'
                      }`}
                      style={{width: `${data.battery}%`}}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <h3 className="font-bold text-xl mb-4 text-gray-900 flex items-center gap-2">
              <span className="text-gray-700">✨</span> System Status
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {isFull && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-green-900">Bottle Full</p>
                    <p className="text-xs text-green-700">Ready to use</p>
                  </div>
                </div>
              )}
              {data.humidity >= 55 && !isFull && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-blue-900">Good Humidity</p>
                    <p className="text-xs text-blue-700">Optimal production</p>
                  </div>
                </div>
              )}
              {data.humidity < 55 && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-yellow-900">Low Humidity</p>
                    <p className="text-xs text-yellow-700">Slow production</p>
                  </div>
                </div>
              )}
              {data.tds > 100 && (
                <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-red-900">Unsafe Water</p>
                    <p className="text-xs text-red-700">Do not drink</p>
                  </div>
                </div>
              )}
              {data.tds <= 100 && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-green-900">Safe Water</p>
                    <p className="text-xs text-green-700">Good quality</p>
                  </div>
                </div>
              )}
              {data.battery < 25 && (
                <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-orange-900">Low Battery</p>
                    <p className="text-xs text-orange-700">Charge needed</p>
                  </div>
                </div>
              )}
              {data.flowRate < 0.2 && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-yellow-900">Low Flow</p>
                    <p className="text-xs text-yellow-700">Check device</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Drink Water Modal */}
      {showDrinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-3xl font-bold mb-2 text-gray-900 flex items-center gap-2">
              🥤 <span>Drink Water</span>
            </h2>
            <p className="text-gray-900 mb-6 font-medium">
              Current level: <span className="font-bold text-green-600 text-xl">{Math.round(data?.waterLevel || 0)}%</span>
            </p>
            
            <div className="mb-8">
              <label className="block text-gray-900 mb-3 font-bold text-lg">
                How much water will remain?
              </label>
              <input 
                type="range" 
                min="0" 
                max={Math.floor(data?.waterLevel || 100)}
                value={remainingLevel}
                onChange={(e) => setRemainingLevel(Number(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <div className="flex justify-between text-sm text-gray-900 mt-3">
                <span className="font-semibold">0%</span>
                <span className="text-3xl font-bold text-green-600">{remainingLevel}%</span>
                <span className="font-semibold">{Math.floor(data?.waterLevel || 100)}%</span>
              </div>
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-gray-900 font-medium">
                  You'll drink: <span className="font-bold text-green-700 text-xl">{Math.floor(data?.waterLevel || 0) - remainingLevel}%</span>
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowDrinkModal(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-3 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDrink}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl font-bold transition-colors shadow-lg"
              >
                Confirm Drink
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
