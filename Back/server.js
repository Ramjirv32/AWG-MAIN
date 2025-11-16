require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { genData } = require('./controller/sensorController');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sensor', require('./routes/sensor'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/support', require('./routes/support'));

app.get('/', (req, res) => {
  res.json({ msg: 'AWG API Running' });
});

setInterval(genData, 30000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  console.log('Simulating sensor data every 30s');
});
