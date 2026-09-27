FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
# Эти две переменные подставляются Vite в браузерный бандл на ЭТАПЕ сборки.
# Остальные секреты остаются только в runtime-окружении контейнера.
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server.js"]
