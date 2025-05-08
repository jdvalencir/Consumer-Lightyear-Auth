import { rabbitMQConsumer } from './rabbitmq/consumer.js'
import { getLogger } from './logger/logger.js'
import { sequelize } from './config/db/db.config.js';

const logger = getLogger()

if (process.env.NODE_ENV === 'development') {
  process.loadEnvFile('.env');
}

async function main() {
    try {
        await sequelize.authenticate();
        logger.info('Conexión establecida con la DB.');
        logger.info('Modelos sincronizados');

        await rabbitMQConsumer.connect()
        await rabbitMQConsumer.consume('registration-queue')
        await rabbitMQConsumer.consumeDeleteUser('delete_data_transferred_user_queue')
        logger.info('Consumer started')
    } catch (error) {
        logger.error('Error:', error);
    }
}

main()