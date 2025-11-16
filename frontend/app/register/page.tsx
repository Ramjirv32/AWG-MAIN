'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Register() {
  const router = useRouter();
  const [data, setData] = useState({ name: '', email: '', password: '', deviceId: 'SIM-AWG-01' });
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const json = await res.json();

      if (!res.ok) {
        setErr(json.msg || 'Registration failed');
        return;
      }

      localStorage.setItem('token', json.token);
      localStorage.setItem('user', JSON.stringify(json.user));
      router.push('/dashboard');
    } catch {
      setErr('Network error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Register</h2>
        
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input 
              type="text" 
              value={data.name}
              onChange={e => setData({...data, name: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              value={data.email}
              onChange={e => setData({...data, email: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password"
              value={data.password}
              onChange={e => setData({...data, password: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device ID</label>
            <input 
              type="text"
              value={data.deviceId}
              onChange={e => setData({...data, deviceId: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}

          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
            Register
          </button>
        </form>

        <p className="mt-4 text-center text-gray-600">
          Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Login</Link>
        </p>
        
        <Link href="/" className="block mt-4 text-center text-gray-600 hover:underline">← Back to Home</Link>
      </div>
    </div>
  );
}
