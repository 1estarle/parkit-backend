# ParkIt - Backend API & Infraestructura Cloud

Este repositorio contiene el código fuente del Backend (Node.js/Express) para el proyecto ParkIt, diseñado bajo una arquitectura orientada a servicios y preparado para alta disponibilidad en entornos Cloud Native.

## Stack Tecnológico

- **Framework:** Node.js con Express
- **Base de Datos:** PostgreSQL
- **Contenedores:** Docker & Docker Compose
- **Orquestación:** Kubernetes (K8s)

## Ejecución Local con Docker Compose

Para levantar toda la infraestructura (Servidor Node.js + Base de Datos PostgreSQL) sin necesidad de instalar dependencias locales, ejecuta un solo comando en la raíz del proyecto:

```bash
docker-compose up --build
```
