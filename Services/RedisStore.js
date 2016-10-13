'use strict';

module.exports = function (logger) {

    // Helpers.
    var Promise = require('bluebird'); // Promise API
    // Redis.
    const redis = require('redis');

    // Redis storage.
    var store = redis.createClient();
    Promise.promisifyAll(redis.RedisClient.prototype);
    Promise.promisifyAll(redis.Multi.prototype);
    const redisdb = process.env.REDISDB || 1;
    // Select database 1.
    store.select(1, function(err,res){
        logger.info('RedisStore running on db ' + redisdb);
    });

    return store;
};

