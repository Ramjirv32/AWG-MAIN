require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { fetchFromAWSAndStore } = require('./controller/awsSyncController');

const app = express();

connectDB();

app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://localhost:3000',
    'https://awg-main-gwv3.vercel.app',
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
