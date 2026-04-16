require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { fetchFromAWSAndStore } = require('./controller/awsSyncController');

const app = express();

connectDB();

app.use(cors({
  origin: [
    'https://7294-2401-4900-6335-89d0-c85d-978-822f-d901.ngrok-free.app',
    'https://8af5-2401-4900-6335-89d0-c85d-978-822f-d901.ngrok-free.app',
    'http://localhost:3001',
    'http://localhost:3000',
    'https://3247-2401-4900-6335-89d0-c85d-978-822f-d901.ngrok-free.app',
    'https://e0aa-2401-4900-6335-89d0-c85d-978-822f-d901.ngrok-free.app'
  ],
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sensor', require('./routes/sensor')); // Local MongoDB data
app.use('/api/sensor-aws', require('./routes/aws-data')); // Direct AWS data
app.use('/api/data', require('./routes/data'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/support', require('./routes/support'));

app.get('/', (req, res) => {
  res.json({ msg: 'AWG API Running - AWS DynamoDB Connected' });
});

// Fetch from AWS every minute and store in local DB
setInterval(fetchFromAWSAndStore, 60000); // 1 minute

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  console.log('Fetching data from AWS DynamoDB every minute and storing locally');
});
