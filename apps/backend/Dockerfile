# Use the official Node.js image as a base
FROM node:24

# pnpm via corepack, version pinned by packageManager in package.json
RUN corepack enable

# Install workspace deps first for layer caching
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN pnpm install --frozen-lockfile

# Copy the rest of the repo (node_modules excluded via .dockerignore)
COPY . .

# Run Prisma generate to generate the client
WORKDIR /repo/apps/backend/api
RUN pnpm exec prisma generate

# Build the project
WORKDIR /repo
RUN pnpm --filter gitbee_backend build

# Expose the port the app will run on
EXPOSE 5000

# Start the application using the "dev" script
CMD ["pnpm", "--filter", "gitbee_backend", "dev"]
