require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Constants
const OFFICIAL_REPO = 'muzii-523/MUZAMMILMD-';
const HEROKU_API = {
  baseURL: 'https://api.heroku.com',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.heroku+json; version=3',
    'Authorization': `Bearer ${process.env.HEROKU_API_KEY}`
  }
};

// 1. Strict Fork Verification
async function verifyFork(username) {
  try {
    // Check if repo exists
    const repoRes = await axios.get(`https://api.github.com/repos/${username}/MUZAMMILMD-`, {
      headers: { 
        'User-Agent': 'MUZAMMIL_MD-Deployer',
        'Accept': 'application/vnd.github.v3+json' 
      }
    });

    // Verify fork source
    if (!repoRes.data.fork || repoRes.data.parent?.full_name !== OFFICIAL_REPO) {
      return false;
    }

    // Verify repo content (check package.json exists)
    const contents = await axios.get(`https://api.github.com/repos/${username}/MUZAMMILMD-/contents/package.json`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      validateStatus: (status) => status === 200 || status === 404
    });

    return contents.status === 200;

  } catch (error) {
    console.error('Fork verification failed:', error.response?.data?.message || error.message);
    return false;
  }
}

// 2. Session ID Validation
function isValidSession(session_id) {
  try {
    return (
      (session_id.startsWith("(MUZAMMIL_MD~)") || session_id.startsWith("MUZAMMIL_MD~")) &&
      Buffer.from(session_id.replace(/^(\(MUZAMMIL_MD~\)|MUZAMMIL_MD~)/, ''), 'base64').length > 20
    );
  } catch {
    return false;
  }
}

// 3. Deployment Endpoint
app.post('/deploy', async (req, res) => {
  const { github_username, session_id } = req.body;

  // Validation Chain
  try {
    // Step 1: GitHub Username Format
    if (!/^[a-zA-Z0-9_-]{1,39}$/.test(github_username)) {
      return res.status(400).json({ 
        error: "Invalid GitHub username format",
        solution: "Use only letters, numbers, hyphens or underscores"
      });
    }

    // Step 2: Fork Verification
    const isVerified = await verifyFork(github_username);
    if (!isVerified) {
      return res.status(403).json({
        error: "Valid fork not found",
        steps: [
          "1. Fork https://github.com/muzii-523/MUZAMMILMD-",
          "2. Wait 2 minutes for GitHub to sync",
          "3. Ensure your fork is public"
        ],
        fork_url: "https://github.com/muzii-523/MUZAMMILMD-/fork"
      });
    }

    // Step 3: Session ID Validation
    if (!isValidSession(session_id)) {
      return res.status(400).json({
        error: "Invalid SESSION_ID",
        required_format: "(MUZAMMIL_MD~)base64_encoded_string",
        example: "(MUZAMMIL_MD~)eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      });
    }

    // Step 4: Heroku Deployment
    const APP_NAME = `muzammil-md-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    await axios.post(`${HEROKU_API.baseURL}/apps`, {
      name: APP_NAME,
      region: 'eu'
    }, { headers: HEROKU_API.headers });

    await axios.patch(`${HEROKU_API.baseURL}/apps/${APP_NAME}/config-vars`, {
      SESSION_ID: session_id,
      GITHUB_USERNAME: github_username
    }, { headers: HEROKU_API.headers });

    await axios.post(`${HEROKU_API.baseURL}/apps/${APP_NAME}/builds`, {
      source_blob: {
        url: `https://github.com/${github_username}/MUZAMMILMD-/tarball/main`
      }
    }, { headers: HEROKU_API.headers });

    res.json({ 
      success: true,
      url: `https://${APP_NAME}.herokuapp.com`,
      appName: APP_NAME,
      deployment_time: new Date().toISOString()
    });

  } catch (error) {
    console.error('Deployment Error:', error.response?.data || error.message);
    res.status(500).json({
      error: "Deployment failed",
      details: error.response?.data?.message || error.message,
      tip: "Check your Heroku API key and quota"
    });
  }
});

// 4. Auto-Cleanup (24h)
setInterval(async () => {
  try {
    const { data: apps } = await axios.get(`${HEROKU_API.baseURL}/apps`, {
      headers: HEROKU_API.headers
    });

    const cleanupTasks = apps.map(async (app) => {
      if (app.name.startsWith('muzammil-md-')) {
        const created = new Date(app.created_at);
        const hoursOld = (Date.now() - created) / (1000 * 60 * 60);
        
        if (hoursOld >= 24) {
          await axios.delete(`${HEROKU_API.baseURL}/apps/${app.name}`, {
            headers: HEROKU_API.headers
          });
          console.log(`♻️ Cleaned up: ${app.name} (${hoursOld.toFixed(1)}h old)`);
        }
      }
    });

    await Promise.all(cleanupTasks);
  } catch (error) {
    console.error('Cleanup Cycle Failed:', error.message);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

// Serve Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  █████╗ ██████╗ ███████╗██╗      ███╗   ██╗
  ██╔══██╗██╔══██╗██╔════╝██║      ████╗  ██║
  ███████║██████╔╝█████╗  ██║█████╗██╔██╗ ██║
  ██╔══██║██╔══██╗██╔══╝  ██║╚════╝██║╚██╗██║
  ██║  ██║██║  ██║███████╗███████╗ ██║ ╚████║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═╝  ╚═══╝
  
  🚀 Server ready: http://localhost:${PORT}
  ✔ GitHub Fork Verification: ACTIVE
  ✔ Heroku Deployment: ENABLED
  ✔ Auto-Cleanup: EVERY 24H
  `);
});
