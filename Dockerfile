FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && pip install yt-dlp --break-system-packages && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npmFROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && pip install yt-dlp --break-system-packages && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"] run build

EXPOSE 3000
CMD ["npm", "start"]
