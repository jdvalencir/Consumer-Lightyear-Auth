import { Sequelize } from 'sequelize';

if (process.env.NODE_ENV === 'development') {
    process.loadEnvFile('.env');
  }
  
// sequelize.js
export const sequelize = new Sequelize({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: 'postgres',
  logging: false,
});
