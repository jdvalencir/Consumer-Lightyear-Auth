import { sequelize } from './db.config.js';
import { User } from '../../models/User.js';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Conexión establecida con la DB.');

    await sequelize.sync({ alter: true }); // Solo en desarrollo
    console.log('Modelos sincronizados');
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
  }
}

main();