module.exports = function (app) {
    return {
        stagingLogger: function () {
            const winston = require('winston');
            const logger = new (winston.Logger)({
                transports: [
                    new (winston.transports.Console)(
                        {
                            colorize: true,
                            json: false,
                            level: 'debug'
                        }
                    ),
                    new (winston.transports.File)(
                        {
                            filename: 'staging.log',
                            colorize: false,
                            json: true,
                            level: 'debug'
                        }
                    )
                ]
            });

            logger.stream = {
                write: function (message, encoding) {
                    logger.info(message);
                }
            };

            // Initialize the morgan logger.
            app.use(require('morgan')('combined', {stream: logger.stream}));

            return logger;
        },
        productionLogger: function () {
            const winston = require('winston');
            const logger = new (winston.Logger)({
                transports: [
                    new (winston.transports.Console)(
                        {
                            colorize: true,
                            json: false,
                            level: 'info'
                        }
                    ),
                    new (winston.transports.File)(
                        {
                            filename: 'production.log',
                            colorize: false,
                            json: true,
                            level: 'error'
                        }
                    )
                ]
            });

            logger.stream = {
                write: function (message, encoding) {
                    logger.info(message);
                }
            };

            // Initialize the morgan logger.
            app.use(require('morgan')('combined', {stream: logger.stream}));

            return logger;
        },
        loggerForEnvironment: function (environment) {
            if (environment === 'production') {
                return this.productionLogger();
            }
            return this.stagingLogger();
        }
    }
};