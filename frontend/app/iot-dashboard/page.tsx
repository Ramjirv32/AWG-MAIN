"use client";

import { useEffect, useState } from "react";

export default function IoTDashboard() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const fetchData = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/simulation/latest");
      const json = await res.json();
      
      if (json.status === "offline") {
        setStatus("offline");
      } else if (json.status === "error") {
        setStatus("error");
      } else {
        setData(json);
        setStatus("online");
        setLastUpdated(0); // Reset timer on successful fetch
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setStatus("error");
    }
  };

  useEffect(() => {
    fetchData();
    const fetchInterval = setInterval(fetchData, 5000);
    const timerInterval = setInterval(() => {
      setLastUpdated((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(timerInterval);
    };
  }, []);

  // Use actual data or fallback
  const flowRate = data?.flow ? `${data.flow.toFixed(2)} ml/min` : "0.00 ml/min";
  const batteryStatus = data?.battery ? `${data.battery}% 🔋` : "80% 🔋";

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 md:p-10 font-sans">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#1e293b] rounded-2xl p-6 mb-8 shadow-2xl border border-slate-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Live Monitoring</h1>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-700">
            <span className={`w-3 h-3 rounded-full ${status === "online" ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            <span className="text-sm font-semibold uppercase tracking-wider">
              {status === "online" ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="text-slate-400 text-sm font-medium mt-4 md:mt-0 flex items-center gap-2">
          <span>⏱ Last Updated:</span>
          <span className="text-blue-400 font-bold">{lastUpdated} sec ago</span>
        </div>
      </div>

      {/* MAIN AREA (Grid Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Temperature Card */}
        <DashboardCard
          label="Temperature"
          value={`${data?.temperature || "32"}°C`}
          icon="🌡"
          color="text-orange-400"
        />

        {/* Humidity Card */}
        <DashboardCard
          label="Humidity"
          value={`${data?.humidity || "65"}%`}
          icon="💧"
          color="text-blue-400"
        />

        {/* Flow Rate Card */}
        <DashboardCard
          label="Flow Rate"
          value={flowRate}
          icon="🚰"
          color="text-cyan-400"
        />

        {/* Water Level Card */}
        <DashboardCard
          label="Water Level"
          value={`${data?.water_level || "75"}% (${getWaterLevelLabel(data?.water_level || 75)})`}
          icon="🛢"
          color="text-blue-500"
        />

        {/* Mode Card */}
        <DashboardCard
          label="Current Mode"
          value={data?.mode || "IDLE"}
          icon="⚡"
          color="text-yellow-400"
        />

        {/* Battery Status Card */}
        <DashboardCard
          label="Battery Status"
          value={batteryStatus}
          icon="🔋"
          color="text-green-400"
        />
      </div>

      {/* FOOTER / STATUS MESSAGES */}
      {status === "loading" && !data && (
        <div className="mt-12 text-center text-slate-500">Initializing sensors...</div>
      )}
      {status === "error" && (
        <div className="mt-12 text-center text-red-400 font-medium tracking-wide">
          ⚠️ Connection issues. Attempting to reconnect...
        </div>
      )}
    </div>
  );
}

const getWaterLevelLabel = (level: number) => {
  if (level >= 80) return "High";
  if (level >= 30) return "Medium";
  return "Low";
};

interface DashboardCardProps {
  label: string;
  value: string;
  icon: string;
  color: string;
}

function DashboardCard({ label, value, icon, color }: DashboardCardProps) {
  return (
    <div className="bg-[#1e293b] p-8 rounded-[2rem] shadow-xl border border-slate-800 hover:border-slate-700 transition-all group flex flex-col justify-between h-48">
      <div className="flex justify-between items-start">
        <span className="text-slate-400 text-sm font-bold uppercase tracking-[0.15em]">
          {label}
        </span>
        <span className="text-3xl filter drop-shadow-md group-hover:scale-110 transition-transform">
          {icon}
        </span>
      </div>
      <div className={`text-5xl font-black tracking-tight ${color}`}>
        {value}
      </div>
    </div>
  );
}
