# AWG Smart Water Bottle System

Complete atmospheric water generator with sensor simulation, real-time monitoring, and AI chatbot.

## System Architecture

```
Backend (Node.js + Express + MongoDB)
- Simulates sensor data every 30s
- Stores data in MongoDB
- REST API for frontend
- Groq AI integration for chatbot

Frontend (Next.js + React + Tailwind)
- Home page
- Login/Register
- Live Dashboard
- AI Chat
- Support tickets
```

## Backend Setup

```bash
cd Back
npm install
node server.js
```

Backend runs on `http://localhost:5000`

### API Endpoints

- `GET /api/sensor/latest` - Latest sensor reading
- `GET /api/sensor/readings?limit=50` - Get multiple readings  
- `GET /api/sensor/predict/fillTime` - Estimated fill time
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/chat` - AI chatbot
- `POST /api/support` - Submit support ticket

### Environment Variables (.env)

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/awg
JWT_SECRET=your_secret_key
GROQ_API_KEY=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
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

## Frontend Setup

```bash
cd front
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### Pages

- `/` - Home page with features
- `/login` - User login
- `/register` - User registration  
- `/dashboard` - Live sensor data with auto-refresh every 5s
- `/chat` - AI assistant powered by Groq
- `/support` - Contact support form

## Database Schema

### Sensor Readings
```js
{
  deviceId: "SIM-AWG-01",
  waterLevel: 0-100,
  humidity: 50-85,
  temp: 20-35,
  waterTemp: 15-30,
  tds: 20-90,
  flowRate: 0.2-1.0,
  battery: 40-100,
  timestamp: Date
}
```

### Users
```js
{
  name: String,
  email: String,
  password: String (hashed),
  deviceId: String,
  createdAt: Date
}
```

### Support Tickets
```js
{
  userId: ObjectId,
  name: String,
  email: String,
  message: String,
  status: "open",
  createdAt: Date
}
```

## Features

✅ Sensor simulation every 30 seconds
✅ Real-time dashboard with auto-refresh
✅ Water level progress bar
✅ TDS water quality monitoring
✅ Battery status
✅ Estimated fill time calculation
✅ AI chatbot using Groq LLaMA 3.1
✅ User authentication with JWT
✅ Support ticket system
✅ Email notifications (nodemailer)
✅ Responsive UI with Tailwind CSS

## AI Chatbot Features

The AI analyzes sensor data and responds to:
- "How much water is in the bottle?"
- "Is the water safe to drink?"
- "How long until full?"
- "Why is production slow?"
- "What's the battery percentage?"

It provides smart recommendations:
- Low humidity warnings
- Water quality alerts
- Battery charge reminders
- Production efficiency tips

## Production Deployment

1. Set MongoDB connection string
2. Update environment variables
3. Build frontend: `npm run build`
4. Start backend: `node server.js`
5. Start frontend: `npm start`

## Testing

Backend test file available: `Back/test.http`

Use REST client or curl to test endpoints.

## Technologies

- Node.js + Express
- MongoDB + Mongoose
- Next.js 16 + React 19
- Tailwind CSS 4
- Groq SDK (LLaMA AI)
- JWT authentication
- Nodemailer
- TypeScript

---

**Ready to use!** 🚀

Backend: http://localhost:5000
Frontend: http://localhost:3000
# AWG-MAIN
