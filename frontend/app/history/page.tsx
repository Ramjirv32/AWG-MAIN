'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function History() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/history`);
        const json = await res.json();
        setHistory(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Calculate statistics
  const totalSessions = history.length;
  const totalWater = totalSessions * 100; // Each session is 100%
  const avgDuration = history.length > 0 
    ? history.reduce((sum, h) => sum + h.fillDuration, 0) / history.length 
    : 0;
  const avgFlowRate = history.length > 0
    ? history.reduce((sum, h) => sum + parseFloat(h.avgFlowRate), 0) / history.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-2">Fill History</h1>
            <p className="text-gray-600 text-lg font-medium">Complete record of all bottle fill sessions</p>
          </div>

          {/* Summary Stats */}
          {history.length > 0 && (
            <div className="grid md:grid-cols-4 gap-6 mb-10">
              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-blue-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Total Sessions</p>
                <p className="text-4xl font-extrabold text-blue-600">{totalSessions}</p>
                <p className="text-sm text-gray-500 mt-1">Completed fills</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-green-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Total Water</p>
                <p className="text-4xl font-extrabold text-green-600">{(totalWater / 50).toFixed(1)}</p>
                <p className="text-sm text-gray-500 mt-1">Liters generated</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-purple-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Avg Duration</p>
                <p className="text-4xl font-extrabold text-purple-600">{Math.floor(avgDuration / 60)}h {avgDuration % 60}m</p>
                <p className="text-sm text-gray-500 mt-1">Per fill session</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-orange-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Avg Flow Rate</p>
                <p className="text-4xl font-extrabold text-orange-600">{avgFlowRate.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">L/min overall</p>
              </div>
            </div>
          )}

          {/* History Cards */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <p className="text-gray-500 text-lg">⏳ Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center border-2 border-gray-100">
              <div className="text-6xl mb-4">💧</div>
              <p className="text-gray-900 text-2xl font-bold mb-2">No History Yet</p>
              <p className="text-gray-500 text-lg">Wait for the first bottle to fill to 100%</p>
              <p className="text-gray-400 text-sm mt-4">History records will appear here automatically</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((h: any, i: number) => {
                const efficiency = parseFloat(h.avgFlowRate) >= 0.5 ? 'Excellent' : parseFloat(h.avgFlowRate) >= 0.3 ? 'Good' : 'Fair';
                const efficiencyColor = parseFloat(h.avgFlowRate) >= 0.5 ? 'green' : parseFloat(h.avgFlowRate) >= 0.3 ? 'blue' : 'yellow';

                return (
                  <div key={i} className="bg-white border-2 border-gray-100 rounded-xl p-6 hover:border-gray-300 hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-bold text-2xl text-gray-900">
                            Session #{String(history.length - i).padStart(3, '0')}
                          </p>
                          <span className={`bg-${efficiencyColor}-100 text-${efficiencyColor}-700 px-3 py-1 rounded-full text-xs font-bold`}>
                            {efficiency} Performance
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 font-mono">{new Date(h.date).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md">
                          ✓ 100% Filled
                        </span>
                        <p className="text-xs text-gray-500 mt-2">{h.totalReadings} data points</p>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-600 font-semibold mb-1 uppercase">Duration</p>
                        <p className="font-bold text-lg text-gray-900">{Math.floor(h.fillDuration / 60)}h {h.fillDuration % 60}m</p>
                      </div>
                      
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <p className="text-xs text-purple-600 font-semibold mb-1 uppercase">Flow Rate</p>
                        <p className="font-bold text-lg text-gray-900">{Number(h.avgFlowRate).toFixed(2)} L/min</p>
                      </div>
                      
                      <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                        <p className="text-xs text-cyan-600 font-semibold mb-1 uppercase">Humidity</p>
                        <p className="font-bold text-lg text-gray-900">{Math.round(h.avgHumidity)}%</p>
                      </div>
                      
                      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                        <p className="text-xs text-orange-600 font-semibold mb-1 uppercase">Temperature</p>
                        <p className="font-bold text-lg text-gray-900">{Number(h.avgTemp).toFixed(1)}°C</p>
                      </div>
                      
                      <div className={`${h.avgTDS > 100 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} p-4 rounded-lg border`}>
                        <p className={`text-xs ${h.avgTDS > 100 ? 'text-red-600' : 'text-green-600'} font-semibold mb-1 uppercase`}>Water Quality</p>
                        <p className="font-bold text-lg text-gray-900">{Math.round(h.avgTDS)} ppm</p>
                        <p className={`text-xs font-bold ${h.avgTDS > 100 ? 'text-red-600' : 'text-green-600'}`}>
                          {h.avgTDS > 100 ? '⚠ Unsafe' : '✓ Safe'}
                        </p>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 font-semibold mb-1 uppercase">Device</p>
                        <p className="font-bold text-sm text-gray-900">{h.deviceId.replace('SIM-', '')}</p>
                      </div>
                    </div>

                    {/* Production Rate Bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-600 mb-2">
                        <span className="font-semibold">Production Efficiency</span>
                        <span className="font-mono">{((parseFloat(h.avgFlowRate) / 1) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                            parseFloat(h.avgFlowRate) >= 0.5 
                              ? 'from-green-400 to-green-600' 
                              : parseFloat(h.avgFlowRate) >= 0.3 
                                ? 'from-blue-400 to-blue-600' 
                                : 'from-yellow-400 to-yellow-600'
                          }`}
                          style={{ width: `${Math.min(100, (parseFloat(h.avgFlowRate) / 1) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
