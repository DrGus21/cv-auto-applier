# Use Microsoft's official Playwright image containing Node.js and system dependencies for Chromium/Firefox
FROM mcr.microsoft.com/playwright:v1.45.0-noble

# Create and set working directory
WORKDIR /app

# Copy package config first to leverage caching
COPY package*.json tsconfig.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application
COPY src/ ./src
COPY cv-profile.json ./

# Build the TypeScript project
RUN npm run build

# Create volumes for persistent data (cookies, screenshots, logs)
RUN mkdir -p cookies logs

# Command to start the daemon
CMD ["npm", "start"]
