import { Sequelize } from 'sequelize';

if (process.env.NODE_ENV === 'development') {
    process.loadEnvFile('.env');
  }

console.log('DB_HOST:', process.env.DB_HOST, 'DB_NAME:', process.env.DB_NAME, 'DB_USER:', process.env, 'DB_USER', 'DB_PASSWORD:', process.env);

// sequelize.js
export const sequelize = new Sequelize({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: 'postgres',
  logging: false,
});
