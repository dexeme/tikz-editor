FROM node:18-bullseye

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    texlive-full \
    latexmk \
    dvisvgm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 5173 3001

CMD ["npm", "run", "dev"]