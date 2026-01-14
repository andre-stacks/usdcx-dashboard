# USDCx Dashboard

Real-time analytics dashboard for the USDCx token on Stacks blockchain.

## Features

- 📊 Live data from Hiro API
- 💰 Total supply tracking
- 👥 Holder analytics
- 🔥 Mint/burn flow visualization
- 📈 Transaction history charts

## Quick Deploy to Vercel

### Option 1: Vercel CLI (Fastest)

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Navigate to project folder
cd usdcx-dashboard

# Deploy (follow prompts to login)
vercel
```

### Option 2: GitHub + Vercel Dashboard

1. Push this folder to a GitHub repository
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repo
4. Click Deploy

### Option 3: Direct Upload

1. Go to [vercel.com/new](https://vercel.com/new)
2. Drag and drop this folder
3. Click Deploy

## Environment Variables

After deploying, add your Hiro API key in Vercel:

1. Go to your project in Vercel dashboard
2. Click **Settings** → **Environment Variables**
3. Add:
   - Name: `NEXT_PUBLIC_HIRO_API_KEY`
   - Value: `your_api_key_here`
4. Click **Save** and **Redeploy**

For local development, the `.env.local` file is already configured.

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Tech Stack

- Next.js 14
- React 18
- Recharts
- Hiro Stacks API

## Contract

USDCx: `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`

[View on Hiro Explorer](https://explorer.hiro.so/token/SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx?chain=mainnet)
