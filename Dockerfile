# Cloud Run container for the BuddyBoard API server
# Uses the existing `npm start` entrypoint (scripts/start-server.js)

FROM node:20-bookworm-slim

WORKDIR /app

# Install deps (including dev) so we can build the Expo web export inside the image.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Build the web export so /public/_expo and /public/assets exist at runtime.
# These folders are gitignored locally and therefore won't be present unless built.
RUN npm run build:web

# Keep runtime image lean.
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
