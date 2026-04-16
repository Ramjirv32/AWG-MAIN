'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Analytics() {
  const [readings, setReadings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sensor/readings?limit=30`);
        const data = await res.json();
        console.log('Fetched readings:', data.length);
        
        // Map AWS fields to expected format
        const mappedData = data.map((item: any) => ({
          ...item,
          waterLevel: item.water_level || item.waterLevel || 0,
          humidity: item.humidity || 0,
          temp: item.temperature || item.temp || 0,
          battery: item.battery || 80,
          flowRate: item.flow_rate || item.flowRate || 0.5,
          timestamp: item.timestamp || new Date()
        }));
        
        setReadings(mappedData);

        if (mappedData.length > 0) {
          const avgFlow = mappedData.reduce((s: number, r: any) => s + (r.flowRate || 0), 0) / mappedData.length;
          const avgHum = mappedData.reduce((s: number, r: any) => s + (r.humidity || 0), 0) / mappedData.length;
          const minBattery = Math.min(...mappedData.map((r: any) => r.battery || 100));
          
          const humTrend = (mappedData[0]?.humidity || 0) - (mappedData[Math.min(9, mappedData.length - 1)]?.humidity || 0);
          const waterGrowth = (mappedData[0]?.waterLevel || 0) - (mappedData[Math.min(9, mappedData.length - 1)]?.waterLevel || 0);

          setStats({
            avgFlow: avgFlow.toFixed(2),
            avgHum: Math.floor(avgHum),
            minBattery,
            humTrend,
            waterGrowth,
            totalReadings: mappedData.length
          });
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, []);

  // Get the last 10 readings for the chart
  const chartData = readings.length > 0 ? readings.slice(0, Math.min(10, readings.length)).reverse() : [];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
            <p className="text-gray-600 text-lg font-medium">Real-time performance metrics and insights</p>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid md:grid-cols-4 gap-6 mb-10">
              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-purple-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Avg Flow Rate</p>
                <p className="text-4xl font-extrabold text-purple-600">{Number(stats.avgFlow).toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">L/min</p>
                <p className="text-xs text-gray-400 mt-2">Last 30 readings</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-blue-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Avg Humidity</p>
                <p className="text-4xl font-extrabold text-blue-600">{Math.round(stats.avgHum)}</p>
                <p className="text-sm text-gray-500 mt-1">%</p>
                <p className="text-xs mt-2 font-semibold">
                  {stats.humTrend > 0 ? (
                    <span className="text-green-600">↑ Rising +{Math.round(stats.humTrend)}%</span>
                  ) : stats.humTrend < 0 ? (
                    <span className="text-red-600">↓ Falling {Math.round(stats.humTrend)}%</span>
                  ) : (
                    <span className="text-gray-500">→ Stable</span>
                  )}
                </p>
              </div>


              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-100 hover:border-orange-300 transition-all">
                <p className="text-gray-600 text-sm mb-2 font-semibold uppercase tracking-wide">Battery Status</p>
                <p className="text-4xl font-extrabold text-orange-600">{stats.minBattery}</p>
                <p className="text-sm text-gray-500 mt-1">%</p>
                <p className="text-xs font-bold mt-2">
                  {stats.minBattery < 30 ? (
                    <span className="text-red-600 bg-red-50 px-2 py-1 rounded">⚡ Charge Soon</span>
                  ) : (
                    <span className="text-green-600 bg-green-50 px-2 py-1 rounded">✓ Good Health</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Vertical Bar Chart Section */}
          {chartData.length > 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border-2 border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                📊 Performance Trends
                <span className="text-sm font-normal text-gray-500">(Last {chartData.length} readings)</span>
              </h2>
              <p className="text-sm text-gray-500 mb-6">Vertical bar chart comparison</p>
              
              {/* Chart Container */}
              <div className="relative h-96 flex items-end justify-around gap-2 border-l-4 border-b-4 border-gray-800 pl-8 pb-8 pr-4">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-sm font-bold text-gray-700 pr-2">
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>

                {/* Horizontal grid lines */}
                <div className="absolute left-8 right-4 top-0 h-full flex flex-col justify-between pointer-events-none">
                  <div className="w-full border-t border-gray-200"></div>
                  <div className="w-full border-t border-gray-200"></div>
                  <div className="w-full border-t border-gray-200"></div>
                  <div className="w-full border-t border-gray-200"></div>
                  <div className="w-full border-t border-gray-200"></div>
                </div>

                {chartData.map((reading, idx) => {
                  const waterHeight = Math.max(3, ((reading.waterLevel || 0) / 100) * 100);
                  const humidityHeight = Math.max(3, ((reading.humidity || 0) / 100) * 100);
                  const flowHeight = Math.max(3, ((reading.flowRate || 0) / 1) * 100);

                  return (
                    <div key={idx} className="flex-1 flex gap-1 items-end h-full group max-w-[120px]">
                      {/* Water Level Bar */}
                      <div className="flex-1 relative">
                        <div 
                          className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all duration-500 hover:from-blue-700 hover:to-blue-500 cursor-pointer shadow-lg"
                          style={{ height: `${waterHeight}%`, minHeight: '12px' }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg font-bold whitespace-nowrap z-10 shadow-xl">
                            💧 {(reading.waterLevel || 0).toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Humidity Bar */}
                      <div className="flex-1 relative">
                        <div 
                          className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-lg transition-all duration-500 hover:from-purple-700 hover:to-purple-500 cursor-pointer shadow-lg"
                          style={{ height: `${humidityHeight}%`, minHeight: '12px' }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg font-bold whitespace-nowrap z-10 shadow-xl">
                            💨 {reading.humidity}%
                          </div>
                        </div>
                      </div>

                      {/* Flow Rate Bar */}
                      <div className="flex-1 relative">
                        <div 
                          className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t-lg transition-all duration-500 hover:from-green-700 hover:to-green-500 cursor-pointer shadow-lg"
                          style={{ height: `${flowHeight}%`, minHeight: '12px' }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg font-bold whitespace-nowrap z-10 shadow-xl">
                            ⚡ {(reading.flowRate || 0).toFixed(2)}L
                          </div>
                        </div>
                      </div>


                      {/* Reading Label */}
                      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-gray-600 whitespace-nowrap">
                        #{idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-6 mt-12 pt-6 border-t-2 border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-t from-blue-600 to-blue-400 rounded shadow"></div>
                  <span className="font-bold text-gray-700">Water Level</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-t from-purple-600 to-purple-400 rounded shadow"></div>
                  <span className="font-bold text-gray-700">Humidity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-t from-green-600 to-green-400 rounded shadow"></div>
                  <span className="font-bold text-gray-700">Flow Rate</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-12 mb-8 border-2 border-gray-100 text-center">
              <p className="text-gray-500 text-lg">⏳ Waiting for sensor data...</p>
              <p className="text-gray-400 text-sm mt-2">Charts will appear once readings are available</p>
            </div>
          )}

          {/* Insights Section */}
          {stats && (
            <div className="bg-white p-8 rounded-xl shadow-lg mb-8 border-2 border-gray-100">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-2">
                🧠 Smart Insights
              </h3>
              <div className="space-y-3">
                {stats.humTrend > 5 && (
                  <p className="text-gray-900 font-medium bg-green-50 border-l-4 border-green-500 p-4 rounded">
                    ✅ Humidity rising (+{Math.round(stats.humTrend)}%) - Production efficiency improving!
                  </p>
                )}
                {stats.humTrend < -5 && (
                  <p className="text-gray-900 font-medium bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                    ⚠️ Humidity falling ({Math.round(stats.humTrend)}%) - Consider relocating device
                  </p>
                )}
                {stats.avgFlow < 0.3 && (
                  <p className="text-gray-900 font-medium bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    ❌ Low average flow rate - Check device placement and humidity
                  </p>
                )}
                {stats.avgFlow >= 0.6 && (
                  <p className="text-gray-900 font-medium bg-green-50 border-l-4 border-green-500 p-4 rounded">
                    ✅ Excellent flow rate ({stats.avgFlow} L/min) - Optimal conditions!
                  </p>
                )}
                {stats.minBattery < 20 && (
                  <p className="text-gray-900 font-medium bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                    🔋 Battery dropped to {stats.minBattery}% - Charge soon!
                  </p>
                )}
                {stats.waterGrowth > 15 && (
                  <p className="text-gray-900 font-medium bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    📈 Strong water production - {Math.round(stats.waterGrowth)}% growth recently
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="bg-white p-8 rounded-xl shadow-lg border-2 border-gray-100">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">
              Recent Readings <span className="text-gray-500 font-normal">({readings.length})</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left py-4 px-4 text-gray-900 font-bold">Time</th>
                    <th className="text-right py-4 px-4 text-gray-900 font-bold">Water</th>
                    <th className="text-right py-4 px-4 text-gray-900 font-bold">Humidity</th>
                    <th className="text-right py-4 px-4 text-gray-900 font-bold">Flow</th>
                    <th className="text-right py-4 px-4 text-gray-900 font-bold">Battery</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4 text-gray-900 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td className="text-right px-4 text-gray-900 font-bold">{Math.round(r.waterLevel || 0)}%</td>
                      <td className="text-right px-4 text-gray-900 font-bold">{Math.round(r.humidity || 0)}%</td>
                      <td className="text-right px-4 text-gray-900 font-bold">{(r.flowRate || 0).toFixed(2)} L/min</td>
                      <td className="text-right px-4 text-gray-900 font-bold">{Math.round(r.battery || 0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
