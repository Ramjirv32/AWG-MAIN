# Project Structure

```
AWG/
├── Back/                           # Backend (Node.js + Express + MongoDB)
│   ├── config/
│   │   └── db.js                   # MongoDB connection
│   ├── controller/
│   │   ├── authController.js       # Login/Register
│   │   ├── sensorController.js     # Sensor data & simulation
│   │   ├── chatController.js       # AI chatbot with Groq
│   │   └── supportController.js    # Support tickets
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication
│   ├── models/
│   │   ├── Sensor.js               # Sensor data schema
│   │   ├── User.js                 # User schema
│   │   └── Support.js              # Support ticket schema
│   ├── routes/
│   │   ├── auth.js                 # Auth routes
│   │   ├── sensor.js               # Sensor routes
│   │   ├── chat.js                 # Chat routes
│   │   └── support.js              # Support routes
│   ├── .env                        # Environment variables
│   ├── server.js                   # Main server file
│   ├── test.http                   # API tests
│   └── package.json
│
└── front/                          # Frontend (Next.js + React + Tailwind)
    ├── app/
    │   ├── page.tsx                # Home page
    │   ├── layout.tsx              # Root layout
    │   ├── globals.css             # Global styles
    │   ├── login/
    │   │   └── page.tsx            # Login page
    │   ├── register/
    │   │   └── page.tsx            # Register page
    │   ├── dashboard/
    │   │   └── page.tsx            # Dashboard with live data
    │   ├── chat/
    │   │   └── page.tsx            # AI chatbot interface
    │   └── support/
    │       └── page.tsx            # Support form
    ├── .env.local                  # Frontend env vars
    ├── next.config.ts
    ├── tailwind.config.js
    └── package.json
```

## Key Files Explained

### Backend

- **server.js**: Main entry, starts Express server, runs sensor simulation every 30s
- **config/db.js**: MongoDB connection setup
- **controller/sensorController.js**: Generates random sensor data, provides API endpoints
- **controller/chatController.js**: Groq AI integration, analyzes sensor data for chatbot
- **controller/authController.js**: User registration/login with bcrypt + JWT
- **controller/supportController.js**: Support ticket submission + email notifications
- **models/**: MongoDB schemas for Sensor, User, Support
- **middleware/auth.js**: JWT token verification
- **routes/**: API route definitions

### Frontend

- **app/page.tsx**: Landing page with features
- **app/dashboard/page.tsx**: Real-time sensor monitoring (auto-refresh every 5s)
- **app/chat/page.tsx**: AI assistant chat interface
- **app/login/page.tsx**: User login form
- **app/register/page.tsx**: User registration form
- **app/support/page.tsx**: Support ticket submission
- **app/layout.tsx**: Root layout with metadata
- **app/globals.css**: Tailwind CSS styles

## Data Flow

```
Sensor Simulation (every 30s)
    ↓
MongoDB Storage
    ↓
REST API Endpoints
    ↓
Frontend Dashboard (auto-refresh 5s)
    ↓
User sees live data

User asks question in chat
    ↓
API fetches latest sensor data
    ↓
Groq AI analyzes data
    ↓
Smart response returned
```

## Simple Variable Names Used

- `data` - sensor or form data
- `err` - error messages
- `res` - response
- `req` - request
- `msg` - message
- `msgs` - messages array
- `id` - identifier
- `temp` - temperature
- `hum` - humidity
- `rand()` - random number generator
- `genData()` - generate data
- `fetch1()`, `fetch2()` - fetch functions
