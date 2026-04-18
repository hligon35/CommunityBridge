FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Native build deps (needed when modules fall back to node-gyp, e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install app dependencies (copy lock files first for better caching)
COPY package*.json ./
# Use npm ci for deterministic installs in containers
RUN npm ci --no-audit --no-fund --progress=false

# Copy app source
COPY . .

# Cloud Run routes traffic to $PORT (defaults to 8080)
EXPOSE 8080

# Default command
CMD ["npm", "start"]
