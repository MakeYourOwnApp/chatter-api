'use strict';

module.exports = function (redisStore, socket, logger) {

    // Helpers.
    var Promise = require('bluebird'); // Promise API
    // Redis.
    const redis = require('redis');

    // Redis storage
    Promise.promisifyAll(redis.RedisClient.prototype);
    Promise.promisifyAll(redis.Multi.prototype);
    var subscriber = redis.createClient();
    const redisdb = process.env.REDISDB || 1;
    // Select database.
    //subscriber.select(redisdb, function(err,res){
        logger.info('RedisSubscriber running on db ' + redisdb);

        subscriber.on('pmessage', function (pattern, event, msg) {
            // Listen on message expired events.
            if (event === process.env.EVENT_EXPIRED) {
                logger.info('expired', msg);
                // Extract channel id.
                var channelId = msg.split('_')[0];
                // Remove message if from message set.
                redisStore.srem('ms:' + channelId, msg);
                socket.emit('expire', msg);
            }
        });
        subscriber.psubscribe(process.env.EVENT_EXPIRED);
    //});


    return subscriber;
};

