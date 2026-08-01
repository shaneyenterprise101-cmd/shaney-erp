const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Bada JSON data handle karne ke liye

// AWS DynamoDB Client Setup
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'ShaneyERP_MasterState';

// 1. Server Health / Sleep Prevention Ping Endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('Server is active and running!');
});

// 2. GET: Poora Data Fetch karna (Single Read)
app.get('/api/data', async (req, res) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id: 'master_backup' },
    };

    const data = await docClient.send(new GetCommand(params));
    
    if (data.Item) {
      res.json({ success: true, data: data.Item.payload });
    } else {
      res.json({ success: false, data: null, message: 'No data found in cloud' });
    }
  } catch (err) {
    console.error('Fetch Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST: Poora Data Upload / Sync karna (Single Write)
app.post('/api/data', async (req, res) => {
  try {
    const systemState = req.body;

    const params = {
      TableName: TABLE_NAME,
      Item: {
        id: 'master_backup',
        payload: systemState,
        updatedAt: new Date().toISOString(),
      },
    };

    await docClient.send(new PutCommand(params));
    res.json({ success: true, message: 'Data successfully synced to DynamoDB!' });
  } catch (err) {
    console.error('Save Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shaney ERP Backend running on port ${PORT}`);
});