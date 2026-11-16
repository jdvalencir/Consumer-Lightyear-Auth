# Consumer-Lightyear-Auth

A Node.js worker that consumes registration and deletion messages from RabbitMQ queues, creates or removes user accounts in Firebase Authentication, and keeps matching user records in PostgreSQL. It is the queue consumer for the Lightyear auth service, with the package author listed as "Marcianos Team".

## Features

- Connects to RabbitMQ and consumes three durable queues:
  - `registration-queue`: creates a Firebase user from the message email, generates a password reset link, validates the citizen against an external adapter service, stores the user in PostgreSQL, registers the citizen in the adapter, and publishes a `register-user` message to the `notifications` queue.
  - `register_transfer_citizen_queue`: same flow for transferred citizens (`id`, `citizenName`, `citizenEmail`), with default document type and address values, and forwards the original payload to `receive_data_transferred_docs_queue`.
  - `delete_data_transferred_user_queue`: finds the user by document number, deletes them from Firebase and PostgreSQL, and publishes a notification to the `notifications` queue.
- Stores users with Sequelize (`id`, `documentType`, `documentNumber`, `name`, `email`, `phone`, `country`, `department`, `city`, `address`).
- Logs with Winston.
- Messages are acknowledged even when processing fails (no retry or dead-letter queue); the code comments note this.

## Tech stack

- Node.js (ES modules)
- amqplib (RabbitMQ)
- firebase-admin
- Sequelize with `pg` (PostgreSQL)
- axios
- winston
- Docker, Kubernetes manifest, GitHub Actions workflow (build and deploy to GKE)

## Project structure

```
index.js              Entry point: DB check, RabbitMQ connect, start consumers
rabbitmq/consumer.js  Queue consumers and publisher, Firebase and adapter calls
models/User.js        Sequelize user model
config/db/            Sequelize connection config and sync script
logger/logger.js      Winston logger
k8s/deployment.yaml   Kubernetes Deployment
Dockerfile
.github/workflows/    CI/CD workflow
```

## Getting started

Requirements: Node.js with `process.loadEnvFile` support (v20.12+ or v21.7+), a reachable RabbitMQ, a PostgreSQL database, and a Firebase service account key.

```bash
npm install
npm run dev     # sets NODE_ENV=development, loads .env, watches index.js
npm start       # node index.js
```

Configuration is read from environment variables (in development, from a `.env` file):

| Variable | Purpose | Default |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Path to the Firebase service account JSON file | `./config/serviceAccountKey.json` |
| `RMQ_USER`, `RMQ_PASS` | RabbitMQ credentials | `user` / `password` |
| `RMQ_HOST`, `RMQ_PORT` | RabbitMQ address | `localhost` / `5672` |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | PostgreSQL connection | none |

The adapter service is called at a hard-coded in-cluster URL, so registration flows need that service to be reachable.

Docker:

```bash
docker build -t consumer-lightyear-auth .
```

There are no automated tests (`npm test` is a placeholder).

## Context

Part of the Marcianos / Lightyear microservice set, deployed to Kubernetes (see `k8s/deployment.yaml` and the GitHub Actions workflow).

## License

Apache License 2.0 (see `LICENSE`). Note that `package.json` declares ISC.
