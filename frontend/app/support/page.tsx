'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Support() {
  const [data, setData] = useState({ name: '', email: '', message: '' });
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('general');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSuccess(false);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const json = await res.json();

      if (!res.ok) {
        setErr(json.msg || 'Failed to submit');
        return;
      }

      setSuccess(true);
      setData({ name: '', email: '', message: '' });
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setErr('Network error');
    }
  };

  const faqs = [
    {
      q: "Why is my water level not increasing?",
      a: "Water production depends on humidity levels. Ensure the device is in a humid area (>60% humidity). Also check that the device is powered on and the fan is running."
    },
    {
      q: "How long does it take to fill the bottle?",
      a: "Fill time varies based on humidity and flow rate. Typically 2-4 hours in good conditions (60-80% humidity). Check the dashboard for real-time estimates."
    },
    {
      q: "Is the water safe to drink?",
      a: "Yes! The system monitors TDS (Total Dissolved Solids). Water is safe when TDS is below 100 ppm. Check water quality in the dashboard before drinking."
    },
    {
      q: "What do the alerts mean?",
      a: "Alerts notify you of important status changes. Critical alerts (red) need immediate attention. Low water alerts are normal during filling. Check the AI Assistant for specific guidance."
    },
    {
      q: "How do I improve water production?",
      a: "1) Place device in humid areas, 2) Ensure good airflow, 3) Keep device clean, 4) Check filters regularly, 5) Maintain battery charge above 50%."
    },
    {
      q: "Battery draining too fast?",
      a: "This is normal during active production. The device uses power to condense water from air. Keep it charged or use continuous power for best results."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex">
      <Sidebar />
      
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
              💬 Support Center
            </h1>
            <p className="text-lg text-gray-600">
              Get help with your Atmospheric Water Generator
            </p>
          </div>

          {/* Quick Help Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl shadow-lg text-white hover:scale-105 transition-transform cursor-pointer">
              <div className="text-4xl mb-3">📚</div>
              <h3 className="text-xl font-bold mb-2">Documentation</h3>
              <p className="text-blue-100 text-sm">
                Complete guides and manuals for your AWG system
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-2xl shadow-lg text-white hover:scale-105 transition-transform cursor-pointer">
              <div className="text-4xl mb-3">🤖</div>
              <h3 className="text-xl font-bold mb-2">AI Assistant</h3>
              <p className="text-purple-100 text-sm">
                Get instant answers from our intelligent assistant
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-lg text-white hover:scale-105 transition-transform cursor-pointer">
              <div className="text-4xl mb-3">📞</div>
              <h3 className="text-xl font-bold mb-2">Live Chat</h3>
              <p className="text-green-100 text-sm">
                Real-time support from our expert team
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <span>❓</span> Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div 
                  key={idx}
                  className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-gray-400 transition-colors"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                    className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="font-bold text-left text-gray-900">{faq.q}</span>
                    <span className={`text-2xl transition-transform ${expandedFaq === idx ? 'rotate-180' : ''}`}>
                      ⌄
                    </span>
                  </button>
                  {expandedFaq === idx && (
                    <div className="px-6 py-4 bg-white border-t-2 border-gray-200">
                      <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 md:p-8">
              <h2 className="text-3xl font-bold text-white mb-2">📧 Contact Us</h2>
              <p className="text-gray-300">
                Can't find what you're looking for? Send us a message!
              </p>
            </div>

            <div className="p-6 md:p-8">
              {success && (
                <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-xl mb-6 flex items-center gap-3 shadow-lg animate-slide-in">
                  <span className="text-3xl">✅</span>
                  <div>
                    <p className="font-bold text-lg">Success!</p>
                    <p className="text-green-100">Your ticket has been submitted. We'll respond within 24 hours.</p>
                  </div>
                </div>
              )}

              {/* Category Selection */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-900 mb-3">Issue Category</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['general', 'technical', 'billing', 'feedback'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-3 rounded-xl font-bold capitalize transition-all ${
                        selectedCategory === cat
                          ? 'bg-gray-900 text-white shadow-lg scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat === 'general' && '💬'}
                      {cat === 'technical' && '🔧'}
                      {cat === 'billing' && '💳'}
                      {cat === 'feedback' && '⭐'}
                      {' '}{cat}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={submit} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      👤 Your Name
                    </label>
                    <input 
                      type="text"
                      value={data.name}
                      onChange={e => setData({...data, name: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-gray-900 focus:border-gray-900 text-gray-900 font-medium transition-all"
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      ✉️ Email Address
                    </label>
                    <input 
                      type="email"
                      value={data.email}
                      onChange={e => setData({...data, email: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-gray-900 focus:border-gray-900 text-gray-900 font-medium transition-all"
                      placeholder="john@example.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    💭 Your Message
                  </label>
                  <textarea 
                    value={data.message}
                    onChange={e => setData({...data, message: e.target.value})}
                    rows={6}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-gray-900 focus:border-gray-900 text-gray-900 font-medium transition-all resize-none"
                    placeholder="Describe your issue or question in detail..."
                    required
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    💡 Tip: Include device details and screenshots for faster resolution
                  </p>
                </div>

                {err && (
                  <div className="bg-red-100 border-2 border-red-500 text-red-800 px-4 py-3 rounded-xl flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <p className="font-bold">{err}</p>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white py-4 rounded-xl hover:from-gray-800 hover:to-gray-700 font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all"
                >
                  🚀 Submit Support Ticket
                </button>
              </form>

              {/* Additional Info */}
              <div className="mt-8 pt-6 border-t-2 border-gray-200">
                <div className="grid md:grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-3xl mb-2">⚡</div>
                    <p className="font-bold text-gray-900">Fast Response</p>
                    <p className="text-sm text-gray-600">Usually within 24h</p>
                  </div>
                  <div>
                    <div className="text-3xl mb-2">🌐</div>
                    <p className="font-bold text-gray-900">24/7 Support</p>
                    <p className="text-sm text-gray-600">Always available</p>
                  </div>
                  <div>
                    <div className="text-3xl mb-2">🎯</div>
                    <p className="font-bold text-gray-900">Expert Help</p>
                    <p className="text-sm text-gray-600">Trained specialists</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
