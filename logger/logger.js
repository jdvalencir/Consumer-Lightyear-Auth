import { createLogger, format, transports } from "winston";

let loggerInstance;

export const getLogger = () => {
    if (loggerInstance) return loggerInstance;
    
    loggerInstance = createLogger({
        level: 'info',
        format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message}) => {
                return `[${timestamp}] ${level.toUpperCase()}: ${message}`
            })
        ),
        transports: [
            new transports.Console(),
            new transports.File({ filename: 'logger/logs/app.log'})
        ],
    })
    return loggerInstance;
}
