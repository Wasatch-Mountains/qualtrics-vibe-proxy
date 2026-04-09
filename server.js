require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/submit-survey', async (req, res) => {
  const { datacenter, surveyId, values } = req.body;
  const API_TOKEN = process.env.QUALTRICS_TOKEN;

  if (!API_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: QUALTRICS_TOKEN is not set.' });
  }
  if (!datacenter || !surveyId || !values || typeof values !== 'object') {
    return res.status(400).json({
      error: 'Body must include datacenter, surveyId, and values (object).',
    });
  }

  const url = `https://${datacenter}.qualtrics.com/API/v3/surveys/${surveyId}/responses`;

  try {
    const response = await axios.post(url, { values }, {
      headers: {
        'X-API-TOKEN': API_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    res.status(200).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || { message: error.message };
    console.error('Qualtrics proxy error:', detail);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Qualtrics request failed.',
      detail,
    });
  }
});

// NEW: The "Dashboard" Route to fetch results
app.get('/responses', async (req, res) => {
  try {
      const { surveyId, datacenter } = req.query; // Dashboard passes these in the URL
      
      const url = `https://${datacenter}.qualtrics.com/API/v3/surveys/${surveyId}/responses`;
      
      const response = await axios.get(url, {
          headers: { 'X-API-TOKEN': process.env.QUALTRICS_TOKEN }
      });

      // We send back just the results array to keep it clean for the dashboard
      res.json(response.data.result.elements); 
  } catch (error) {
      console.error("Fetch Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Could not fetch vibes." });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`qualtrics-proxy-service listening on http://localhost:${PORT}`);
});
