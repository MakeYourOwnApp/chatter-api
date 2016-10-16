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
            // Listen on expired events.
            if (event === process.env.EVENT_EXPIRED) {
                if(msg.indexOf('_') > -1) {
                    // Messages expired.
                    // Extract channel id.
                    var channelId = msg.split('_')[0];
                    // Remove message if from message set.
                    redisStore.srem('ms:' + channelId, msg);
                    socket.emit('message:expired', msg);
                    logger.info('Message expired', msg);
                } else {
                    // Channel expired.
                    // Remove message if from channel set.
                    // TODO: Check if messages are left before remove
                    redisStore.srem('cs', msg);
                    socket.emit('channel:expired', msg);
                    logger.info('Channel expired', msg);
                }
            }
        });
        subscriber.psubscribe(process.env.EVENT_EXPIRED);
    //});


    return subscriber;
};

