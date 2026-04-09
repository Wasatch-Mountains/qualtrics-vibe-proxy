require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AdmZip = require('adm-zip'); // Add this at the very top of your file

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

app.get('/responses', async (req, res) => {
  try {
      const { surveyId, datacenter } = req.query;
      const baseUrl = `https://${datacenter}.qualtrics.com/API/v3/surveys/${surveyId}/export-responses`;
      const headers = { 'X-API-TOKEN': process.env.QUALTRICS_TOKEN, 'Content-Type': 'application/json' };

      // --- STEP 1: START THE EXPORT ---
      // We tell Qualtrics: "Hey, prepare a JSON file of all my data."
      const startResponse = await axios.post(baseUrl, { format: 'json' }, { headers });
      const progressId = startResponse.data.result.progressId;
      console.log(`🚀 Export started. Progress ID: ${progressId}`);

      // --- STEP 2: POLL FOR COMPLETION ---
      // We check back every 500ms to see if Qualtrics is done "cooking" the file.
      let fileId = null;
      while (!fileId) {
          const statusResponse = await axios.get(`${baseUrl}/${progressId}`, { headers });
          const status = statusResponse.data.result.status;
          
          if (status === 'complete') {
              fileId = statusResponse.data.result.fileId;
          } else if (status === 'failed') {
              throw new Error("Qualtrics export failed.");
          } else {
              // Wait half a second before checking again so we don't spam the API
              await new Promise(resolve => setTimeout(resolve, 500));
          }
      }

      // --- STEP 3: DOWNLOAD & UNZIP ---
      // Qualtrics sends a ZIP file. We download it as a "buffer" (raw data).
      const downloadResponse = await axios.get(`${baseUrl}/${fileId}/file`, {
          headers,
          responseType: 'arraybuffer'
      });

      // Use adm-zip to open the "package" in memory without saving it to disk
      const zip = new AdmZip(Buffer.from(downloadResponse.data));
      const zipEntries = zip.getEntries(); // Usually just one .json file inside
      const jsonData = JSON.parse(zipEntries[0].getData().toString('utf8'));

      // Send the "responses" array back to your dashboard
      // We look for 'responses' inside the JSON Qualtrics generated
      res.json(jsonData.responses);

  } catch (error) {
      console.error("❌ Step-Dance Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to sync with Frankfurt." });
  }
});

// TEST ROUTE: Does the Proxy even see the Survey?
app.get('/test-connection', async (req, res) => {
  try {
      const { surveyId, datacenter } = req.query;
      const url = `https://${datacenter}.qualtrics.com/API/v3/survey-definitions/${surveyId}`;
      
      const response = await axios.get(url, {
          headers: { 'X-API-TOKEN': process.env.QUALTRICS_TOKEN }
      });

      res.json({
          status: "Connected!",
          surveyName: response.data.result.SurveyName,
          responseCount: response.data.result.ResponseCount
      });
  } catch (error) {
      res.status(500).json(error.response?.data || error.message);
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`qualtrics-proxy-service listening on http://localhost:${PORT}`);
});
