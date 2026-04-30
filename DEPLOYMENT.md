# Track My Rent Render Deployment

## Render service

Create a new Render Blueprint from this repository, or create a Web Service manually with:

- Root directory: leave blank
- Build command: `cd backend && npm ci`
- Start command: `cd backend && npm start`
- Health check path: `/healthz`
- Runtime: Node

## Environment variables

Set these in Render, not in Git:

- `NODE_ENV=production`
- `MONGO_URI`
- `JWT_SECRET`
- `SIGN_SECRET` for lease-signing email links. Use a long random value.
- `FRONTEND_URL=https://trackmyrent.co.za`
- `CORS_ORIGINS=https://trackmyrent.co.za,https://www.trackmyrent.co.za`
- `OPENAI_API_KEY` if AI features are enabled
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_FROM`, `EMAIL_USER`, `EMAIL_PASS` if email is enabled
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` if SMS is enabled

For Gmail SMTP, use an app password for `EMAIL_PASS`. `EMAIL_FROM` usually needs to use the same mailbox as `EMAIL_USER`.

## Domain

In Render, add both custom domains:

- `trackmyrent.co.za`
- `www.trackmyrent.co.za`

Then update DNS at your domain provider with the records Render gives you. After DNS verifies, Render will issue SSL certificates.

## Important security note

Real `.env` files were present locally. Do not commit them. Rotate any exposed credentials before production launch, especially database, OpenAI, email, and Twilio keys.
