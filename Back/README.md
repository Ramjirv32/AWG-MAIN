# AWG Backend

## Setup

1. Install MongoDB
2. Copy `.env` and update values
3. Run: `npm install`
4. Start: `node server.js`

## API Endpoints

### Auth
- POST `/api/auth/register` - Register user
- POST `/api/auth/login` - Login
- GET `/api/auth/me` - Get user (auth required)

### Sensor
- GET `/api/sensor/latest` - Latest reading
- GET `/api/sensor/readings?limit=50` - Get readings
- GET `/api/sensor/predict/fillTime` - Fill time prediction

### Chat
- POST `/api/chat` - AI chatbot (body: { msg: "your question" })

### Support
- POST `/api/support` - Submit ticket
- GET `/api/support` - Get tickets (auth required)

## Auto Simulation

Sensor data generated every 30 seconds automatically.
