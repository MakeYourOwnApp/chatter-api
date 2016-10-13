'use strict';

module.exports = function (redisStore, redisSub, logger) {

    // Helper.
    var Promise = require('bluebird'); // Promise API
    // Router.
    const router = require('express').Router();

    router.get('/channels', function (req, res, next) {
        // Get channel set containing all channel ids
        redisStore.smembersAsync('cs')
            .then(function(channelSet) {
                var channels = [];
                // Return promises for channels in set.
                var promises = channelSet.map(function(channel) {
                    return redisStore.multi().hgetall(channel).execAsync().then(function(result) {
                        channels.push(result[0]);
                    });
                });
                // Wait for all promises to resolve.
                Promise.all(promises).then(function(result) {
                    return res.status(200).send(channels);
                });
            });

        // r.smembersAsync('cs')
        //     .then(function (channelsSet) {
        //         res.writeHead(200, {'Content-Type': 'application/json'});
        //         res.write("["); //start array
        //         return channelsSet; //resolve promise
        //     })
        //     .each(function (channelName, index, length) {
        //         return r.hgetallAsync("channels:" + channelName).then(function (channel) {
        //             res.write(JSON.stringify(channel)); //Add object
        //             if (index < length - 1) res.write(","); //Concatenate objects
        //         });
        //     })
        //     .finally(function () {
        //         res.write("]"); //end array
        //         res.end(); //close stream
        //     });
    });

    router.post('/channels', function (req, res, next) {
        var channel = req.body;

        //Sanity checks
        if (!channel.name || !channel.createdBy) {
            return res.status(400).send('Channel validation failed, has to contain "text", "createdBy"');
        }

        // Add timestamp and id.
        channel.createdOn = Date.now();
        channel.expiresOn = channel.createdOn + 15000;
        channel.id = 'c:' + channel.createdOn + '.' + channel.createdBy;

        // Store in channels set by id.
        redisStore.sadd('cs', channel.id);

        // Create channel.
        redisStore.multi() //Start atomic transactions
            .hmset(channel.id, channel)
            .expire(channel.id, 60*60*15)
            .execAsync() //Execute atomic transactions
            .then(function (result) {
                logger.info('POST Channel:', channel);
                // Append channel to request for post processing.
                req.channel = channel;
                return res.sendStatus(201);
                //io.emit('post', post);
            })
            .error(function (error) {
                logger.error('POST Channel:', error);
                return res.status(500).send(error);
            });
    });

    router.get('/channels/:channelId/messages', function (req, res, next) {
        var channelId = req.params.channelId;
        // Get channel set containing all channel ids
        redisStore.smembersAsync('ms:' + channelId)
            .then(function(messageSet) {
                var messages = [];
                // Return promises for messages in channel set.
                var promises = messageSet.map(function(message) {
                    return redisStore.multi().hgetall(message).execAsync().then(function(result) {
                        messages.push(result[0]);
                    });
                });
                // Wait for all promises to resolve.
                Promise.all(promises).then(function(result) {
                    return res.status(200).send(messages);
                });
            });
    });

    // Post new message.
    router.post('/channels/:channelId/messages', function (req, res, next) {
        var channelId = req.params.channelId;
        var message = req.body;

        //Sanity checks
        if (!message.text || !message.createdBy) {
            return res.status(400).send('Message validation failed, has to contain "text", "createdBy"');
        }

        // Add timestamp, channel and id.
        message.createdOn = Date.now();
        message.expiresOn = message.createdOn + 15000;
        message.id = channelId + '_m:' + message.createdOn + '.' + message.createdBy;

        // Store in messages set by id.
        redisStore.sadd('ms:' + channelId, message.id);

        //Create post
        redisStore.multi() //Start atomic transactions
            .hmset(message.id, message)
            .expire(message.id, 15)
            .execAsync() //Execute atomic transactions
            .then(function (result) {
                logger.info('POST Message:', message);
                // Append message to request for post processing.
                req.message = message;
                return res.sendStatus(201);
            })
            .error(function (error) {
                logger.error('POST Message:', error);
                return res.status(500).send(error);
            });
    });

    router.put('/channels/:channelId/messages/:messageId', function (req, res, next) {
        //Extend lifetime
        var messageId = req.params.messageId;

        redisStore.ttlAsync(messageId) //Read time to live
            .bind({}) //Initialize a new (empty) this object for data exchange between all promises
            .then(function (ttl) {
                //Calculate and store new duration
                this.ttl = Number(ttl) + 5;
                return redisStore.expireAsync(messageId, this.ttl);
            })
            .then(function () {
                //Calculate new expiration
                this.expiresOn = Date.now() + (this.ttl * 1000);
                return redisStore.hsetAsync(messageId, 'expires', this.expiresOn);
            })
            .then(function () {
                // Append message to request for post processing.
                req.messageExtend = {
                    id: messageId,
                    expiresOn: this.expiresOn
                };
                return res.sendStatus(200);
            })
            .error(function(){
                return res.status(500).send(err);
            });
    });

    return router;
};