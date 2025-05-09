import { getLogger } from '../logger/logger.js'
import admin from 'firebase-admin';
import axios from 'axios'
import { User } from '../models/User.js';
import amqp from 'amqplib'
import path from 'path'

let serviceAccount = path.resolve(process.env.FIREBASE_API_KEY || './config/serviceAccountKey.json')

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
})

const rmqUser = process.env.RMQ_USER || 'user'
const rmqPass = process.env.RMQ_PASS || 'password'
const rmqPort = process.env.RMQ_PORT || 5672
const rmqHost = process.env.RMQ_HOST || 'localhost'

const logger = getLogger()

class RabbitMQConsumer {
    constructor () {
        this.connection = null
        this.channel = null
    }

    async connect () {
        try {
            const url = `amqp://${rmqUser}:${rmqPass}@${rmqHost}:${rmqPort}`
            this.connection = await amqp.connect(url)
            this.channel = await this.connection.createChannel()
            logger.info('RabbitMQ connected')
        } catch (error) {
            logger.error('RabbitMQ connection error:', error)
            throw error
        }
    }

    async consumeDeleteUser (queue) {
        try {
            await this.channel.assertQueue(queue, { durable: true })
            this.channel.consume(queue, async (msg) => {
                if (!msg) return 

                try { 
                    const data = JSON.parse(msg.content.toString())
                    logger.info(`Received message to delete user: ${data}`)

                    // Delete the user from Firebase
                    const user = await User.findOne({
                        where: {
                            idNumber: data.idNumber,
                        },
                    })

                    // Delete user from Firebase
                    if (user) {
                        await admin.auth().deleteUser(user.id)
                        logger.info(`User deleted from Firebase: ${user.id}`)
                    } else {
                        logger.error(`User not found in Firebase: ${data.idNumber}`)
                        throw new Error(`User not found in Firebase: ${data.idNumber}`)
                    }

                    // Delete the user from the database
                    await User.destroy({
                        where: {
                            idNumber: data.idNumber,
                        },
                    })
                    logger.info(`User deleted from DB: ${user}`)

                    this.publish('notifications', {
                        "action": "transfer_success",
                        "to_email": user.email
                    })
                    logger.info(`Send notification to user`)
                    this.channel.ack(msg)
                } catch (error) {
                    logger.error('Error processing delete user message:', error)

                    return this.channel.ack(msg) 
                }
            })
        } catch (error) {
            logger.error('RabbitMQ consume error:', error)
        }
    }

    async consume (queue) {
        try {
            await this.channel.assertQueue(queue, { durable: true })
            this.channel.consume(queue, async (msg) => {
                if (!msg) return 

                try { 
                    const data = JSON.parse(msg.content.toString())

                    const {
                        email,
                        firstName,
                        secondName,
                        lastName,
                        secondLastName,
                      } = data

                      const fullName = [firstName, secondName, lastName, secondLastName]
                      .filter(Boolean)
                      .join(' ')


                    logger.info(`Received message email: ${email}, fullName: ${fullName}`)

                    const firebaseUser = await admin.auth().createUser({
                        email: email,
                    })
                    
                    logger.info(`User created with email: ${email}`)

                    let resetUrl = ""
                    try {
                        // Generate a password reset link
                        resetUrl = await admin.auth().generatePasswordResetLink(email)
                        logger.info(`Password reset link generated: ${resetUrl}`)
                        logger.info(`Password reset email sent to ${email}`)
                    } catch (error) {
                        logger.error(`Error sending password reset email to ${email}:`, error)
                    }

                    // Validate the citizen using the external service
                    const urlValidate = `http://mrpotato-adapter-service.mrpotato-adapter.svc.cluster.local/v1/adapter/validateCitizen/${data.id}`
                    const headersValidate = {
                        'Content-Type': 'application/json',
                    }

                    const responseValidateCitizen = await axios.get(urlValidate, {
                        headers: headersValidate,
                    })


                    logger.info(`Response from validate citizen: ${responseValidateCitizen.status}`)

                    if (responseValidateCitizen.status === 204) {
                        logger.info(`Citizen is valid: ${responseValidateCitizen.status}`)
                    } else {
                        logger.error(`Citizen is not valid: ${responseValidateCitizen.status} - ${responseValidateCitizen.statusText}`)
                        throw new Error(`Citizen is not valid: ${responseValidateCitizen.status} - ${responseValidateCitizen.statusText}`)
                    }

                    // Create the user in the database
                    const user = await User.create({
                        id: firebaseUser.uid,
                        documentType: data?.documentType,
                        documentNumber: data.id,
                        name: fullName,
                        email: email,
                        phone: data?.phone || null,
                        country: data?.country || null,
                        department: data?.department || null,
                        city: data?.city || null,
                        address: data?.address || null,
                    })

                    logger.info(`User created in DB: ${user.id}`)

                    // Register the citizen in the external service
                    const url = `http://mrpotato-adapter-service.mrpotato-adapter.svc.cluster.local/v1/adapter/registerCitizen`
                    const body = {
                        id: data.id,
                        name: fullName,
                        address: data.address,
                        email: email,
                        operatorId: "681466aaedee130015720b44",
                        operatorName: "Operador Marcianos"
                    }

                    const headers = {
                        'Content-Type': 'application/json',
                    }

                    const response = await axios.post(url, body, {
                        headers: headers,
                    })

                    logger.info(`Response from register citizen: ${response.status}`)

                    if (response.status === 201 && response.data.registered) {
                        logger.info(`Citizen registered successfully: ${response.data.registered}`)
                    } else {
                        logger.error(`Failed to register citizen: ${response.status} - ${response.statusText}`)
                        throw new Error(`Failed to register citizen: ${response.status} - ${response.statusText}`)
                    }

                    // Publish a message to the notifications queue
                    this.publish('notifications', {
                        action: 'register-user',
                        passwordUrl: resetUrl,
                        name: fullName,
                        to_email: email,
                    })
                    this.channel.ack(msg)
                } catch (error) {
                    // Log the specific Firebase error if available
                    if (error.code && error.message) {
                         logger.error(`Firebase Error (${error.code}): ${error.message}`);
                    } else {
                        logger.error('Error processing message:', error)
                    }
                    // Acknowledge the message even if processing fails to prevent reprocessing loop
                    // Consider moving to a dead-letter queue for failed messages in production
                    return this.channel.ack(msg) 
                }
            })
        } catch (error) {
            logger.error('RabbitMQ consume error:', error)
        }
    }

    async consumeRegisterCitizen(queue) {
        try {
            await this.channel.assertQueue(queue, { durable: true });
            this.channel.consume(queue, async (msg) => {
                if (!msg) return;

                try {
                    const data = JSON.parse(msg.content.toString());
                    const { id, citizenName, citizenEmail, urlDocuments, confirmAPI } = data;

                    logger.info(`Received message to register citizen: id=${id}, name=${citizenName}, email=${citizenEmail}`);

                    // Create user in Firebase
                    const firebaseUser = await admin.auth().createUser({
                        email: citizenEmail,
                    });
                    
                    logger.info(`User created with email: ${citizenEmail}`);

                    // Generate password reset link
                    let resetUrl = "";
                    try {
                        resetUrl = await admin.auth().generatePasswordResetLink(citizenEmail);
                        logger.info(`Password reset link generated: ${resetUrl}`);
                        logger.info(`Password reset email sent to ${citizenEmail}`);
                    } catch (error) {
                        logger.error(`Error sending password reset email to ${citizenEmail}:`, error);
                    }

                    // Validate the citizen using the external service
                    const urlValidate = `http://mrpotato-adapter-service.mrpotato-adapter.svc.cluster.local/v1/adapter/validateCitizen/${id}`;
                    const headersValidate = {
                        'Content-Type': 'application/json',
                    };

                    const responseValidateCitizen = await axios.get(urlValidate, {
                        headers: headersValidate,
                    });

                    logger.info(`Response from validate citizen: ${responseValidateCitizen.status}`);

                    if (responseValidateCitizen.status === 204) {
                        logger.info(`Citizen is valid: ${responseValidateCitizen.status}`);
                    } else {
                        logger.error(`Citizen is not valid: ${responseValidateCitizen.status} - ${responseValidateCitizen.statusText}`);
                        throw new Error(`Citizen is not valid: ${responseValidateCitizen.status} - ${responseValidateCitizen.statusText}`);
                    }

                    // Create the user in the database
                    const user = await User.create({
                        id: firebaseUser.uid,
                        documentType: 'CC', // Default document type
                        documentNumber: id,
                        name: citizenName,
                        email: citizenEmail,
                    });

                    logger.info(`User created in DB: ${user.id}`);

                    // Register the citizen in the external service
                    const url = `http://mrpotato-adapter-service.mrpotato-adapter.svc.cluster.local/v1/adapter/registerCitizen`;
                    const body = {
                        id: id,
                        name: citizenName,
                        email: citizenEmail,
                        operatorId: "681466aaedee130015720b44",
                        operatorName: "Operador Marcianos"
                    };

                    const headers = {
                        'Content-Type': 'application/json',
                    };

                    const response = await axios.post(url, body, {
                        headers: headers,
                    });

                    logger.info(`Response from register citizen: ${response.status}`);

                    if (response.status === 201 && response.data.registered) {
                        logger.info(`Citizen registered successfully: ${response.data.registered}`);
                    } else {
                        logger.error(`Failed to register citizen: ${response.status} - ${response.statusText}`);
                        throw new Error(`Failed to register citizen: ${response.status} - ${response.statusText}`);
                    }

                    // Send notification
                    this.publish('notifications', {
                        action: 'register-user',
                        passwordUrl: resetUrl,
                        name: citizenName,
                        to_email: citizenEmail,
                    });

                    // Forward the same payload to the receive_data_transferred_docs_queue
                    await this.publish('receive_data_transferred_docs_queue', data);
                    logger.info(`Payload forwarded to receive_data_transferred_docs_queue`);

                    this.channel.ack(msg);
                } catch (error) {
                    // Log the specific Firebase error if available
                    if (error.code && error.message) {
                        logger.error(`Firebase Error (${error.code}): ${error.message}`);
                    } else {
                        logger.error('Error processing register citizen message:', error);
                    }
                    // Acknowledge the message even if processing fails
                    return this.channel.ack(msg);
                }
            });
        } catch (error) {
            logger.error('RabbitMQ consume error:', error);
        }
    }

    async close () {
        try {
            await this.channel.close()
            await this.connection.close()
            logger.info('RabbitMQ connection closed')
        } catch (error) {
            logger.error('RabbitMQ close error:', error)
            throw error
        }
    }

    async publish (queue, data) {
        try {
            logger.info(`Publishing message to RabbitMQ: ${JSON.stringify(data)}`, )
            await this.channel.assertQueue(queue, { durable: true })
            this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true })
            logger.info(`Message published: ${JSON.stringify(data)}`)
        } catch (error) {
            logger.error('RabbitMQ publish error:', error)
            throw error
        }
    }
}

export const rabbitMQConsumer = new RabbitMQConsumer()