#!/bin/bash
# Script de despliegue automático y discreto hacia el servidor de la empresa

SERVER_IP="159.89.158.2"
SERVER_PATH="/root/home/proyectos/api-scheduler"

echo "📦 1. Comprimiendo el proyecto..."
tar -czvf ~/Desktop/api-scheduler.tar.gz --exclude='node_modules' --exclude='.git' -C ~/Desktop/ api-scheduler

echo "📤 2. Subiendo archivos al servidor..."
scp ~/Desktop/api-scheduler.tar.gz root@${SERVER_IP}:/root/

echo "🚀 3. Actualizando e iniciando el contenedor en el servidor..."
ssh root@${SERVER_IP} "
  tar -xzvf /root/api-scheduler.tar.gz -C /root/home/proyectos/ && \
  rm -f /root/api-scheduler.tar.gz && \
  cd ${SERVER_PATH} && \
  docker compose build --no-cache && \
  docker compose up -d
"

echo "✅ ¡Despliegue completado con éxito de forma anónima!"
