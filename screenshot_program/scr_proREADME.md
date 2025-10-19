# Screenshot Program (Next.js + Electron)

This folder contains a minimal Next.js app wrapped by Electron for a simple screenshot program UI.

## Setup

1. Install dependencies

```powershell
npm install
```

2. Create `.env.local` with your Google OAuth credentials and NextAuth secret:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=some-long-random-secret
```

3. Run dev (Next.js only):

```powershell
npm run dev
```

4. Run Electron with Next.js in dev (opens an Electron window after Next is ready):

```powershell
npm run dev:electron
```

## Package

To build and package the app (requires electron-builder):

```powershell
npm run package:electron
```

(You may need to configure additional settings for code signing on macOS.)

