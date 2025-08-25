import express from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/auth/slack/login', (req, res) => {
  const scopes = 'channels:read,groups:read,search:read,users:read,channels:history,groups:history';
  const url = `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${process.env.SLACK_AUTH_URI}`;
  res.redirect(url);
});

app.get('/auth/slack/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.status(400).send(`OAuth error: ${error}`);
  }
  
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  
  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code: code as string,
        redirect_uri: process.env.SLACK_AUTH_URI!
      })
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${data.error}`);
    }
    
    await prisma.slackToken.upsert({
      where: { team_id: data.team.id },
      update: {
        access_token: data.access_token,
        team_name: data.team.name
      },
      create: {
        access_token: data.access_token,
        team_id: data.team.id,
        team_name: data.team.name
      }
    });
    
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>Success!</h1>
          <p>Slack workspace "${data.team.name}" connected!</p>
          <p>Team ID: <code>${data.team.id}</code></p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Slack MCP Auth Server',
    endpoints: {
      login: '/auth/slack/login',
      callback: '/auth/slack/callback',
      teams: '/teams'
    }
  });
});

app.get('/teams', async (req, res) => {
  try {
    const teams = await prisma.slackToken.findMany({
      select: {
        team_id: true,
        team_name: true,
        createdAt: true
      }
    });
    res.json({ teams });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch teams',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
  console.log(`To authenticate: http://localhost:${PORT}/auth/slack/login`);
});