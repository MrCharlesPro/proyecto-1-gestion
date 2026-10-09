# webapp — API REST con pipeline CI/CD

API REST (Node.js + Express + SQLite) con 14 endpoints, pruebas Jest/Supertest, imagen Docker,
GitHub Actions y despliegue automático en AWS EC2.

## Arquitectura

    git push (main) -> GitHub Actions
        1. test    : npm ci + jest --coverage (umbral 70%)
        2. docker  : build + push a Docker Hub (:latest y :<sha>)
        3. deploy  : SSH a EC2 -> docker pull/stop/rm/run (puerto 80)

## Comandos locales

    npm install
    PORT=3000 npm start          # API en http://localhost:3000
    npm test                     # pruebas
    npm run test:coverage        # pruebas + cobertura

    docker build -t webapp .
    docker run -d -p 80:80 -p 6061:6061 -v webapp-data:/app/data webapp

## Endpoints

| Grupo   | Endpoints |
|---------|-----------|
| Users   | GET/POST /api/users, GET/PUT/DELETE /api/users/:id |
| Tasks   | GET/POST /api/tasks, GET/PUT/DELETE /api/tasks/:id, PATCH /api/tasks/:id/complete |
| Sistema | GET /health, POST /api/backup, DELETE /api/reset |

Formato de respuesta: `{ "statusCode": 200, "data": [...] }`.

## Configuración (GitHub Secrets)

| Secret | Contenido |
|--------|-----------|
| DOCKERHUB_USERNAME | Usuario de Docker Hub |
| DOCKERHUB_TOKEN | Personal Access Token de Docker Hub |
| EC2_HOST | IP pública de la EC2 |
| EC2_USER | `ubuntu` |
| EC2_SSH_KEY | Contenido completo del archivo .pem |

## EC2 (Ubuntu)

Security Group: puertos 22 (SSH) y 80 (HTTP). Docker instalado y usuario `ubuntu` en el grupo `docker`.
