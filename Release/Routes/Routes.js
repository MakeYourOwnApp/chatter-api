'use strict';

module.exports = function (redisStore, redisSub, logger) {

    // Helper.
    var Promise = require('bluebird'); // Promise API
    // Router.
    const router = require('express').Router();

    router.get('/channels', function (req, res, next) {
        // TODO: OMG -> Refactor using by async lib!
        // Get channel set containing all channel ids
        redisStore.smembersAsync('cs')
            .then(function(channelSet) {
                var channels = [];
                var msPromises = [];
                // Return promises for channels in set.
                var promises = channelSet.map(function(channel) {
                    return redisStore.multi().hgetall(channel).execAsync().then(function(result) {
                        // Remove expired channels if null.
                        if(result[0]) {
                            var channel = result[0];
                            msPromises.push(redisStore.multi().scard('ms:' + channel.id).execAsync().then(function(number) {
                                channel.messageCount = number[0];
                                channels.push(channel);
                            }));
                        } else {
                            // TODO: Remove expired channels from set.
                            console.log('NULL', result);
                            //redisStore.srem('cs', msg);
                        }
                    });
                });
                // Wait for all promises to resolve.
                Promise.all(promises).then(function(result) {
                    Promise.all(msPromises).then(function(result) {
                        console.log('ALL DONE');
                        // Sort channels by expiry date.
                        channels.sort(function (a, b) {
                            return (a.expiresOn > b.expiresOn) ? 1 : ((b.expiresOn > a.expiresOn) ? -1 : 0);
                        });
                        return res.status(200).send(channels);
                    });
                });
            });
    });

    router.post('/channels', function (req, res, next) {
        var channel = req.body;
        //Sanity checks
        if (!channel.name || !channel.createdBy) {
            return res.status(400).send('Channel validation failed, has to contain "text", "createdBy"');
        }

        // Add timestamp and id.
        channel.createdOn = Date.now();
        channel.expiresOn = channel.createdOn + 30*60*1000; // plus 30 min
        channel.id = 'c:' + channel.createdOn + '.' + channel.createdBy;

        // Store in channels set by id.
        redisStore.sadd('cs', channel.id);

        // Create channel.
        redisStore.multi() //Start atomic transactions
            .hmset(channel.id, channel)
            .expire(channel.id, 30*60) // plus 30 min.
            .execAsync() //Execute atomic transactions
            .then(function (result) {
                logger.info('POST Channel:', channel);
                channel.expiresOn = channel.expiresOn.toString();
                channel.createdOn = channel.createdOn.toString();
                // Append channel to request for post processing.
                req.channel = channel;
                return res.status(201).send(channel);
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
                        // Remove expired messages if null.
                        if(result[0]) {
                            messages.push(result[0]);
                        } else {
                            // TODO: Remove expired messages from set.
                            console.log('NULL', result);
                            //redisStore.srem('ms:' + channelId, msg);
                        }
                    });
                });
                // Wait for all promises to resolve.
                Promise.all(promises).then(function(result) {
                    // Sort Messages by created at.
                    messages.sort(function(a,b) {return (a.createdOn > b.createdOn) ? 1 : ((b.createdOn > a.createdOn) ? -1 : 0);} );
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
        message.expiresOn = message.createdOn + 15*60*1000; // plus 15 min.
        message.id = channelId + '_m:' + message.createdOn + '.' + message.createdBy;

        // Store in messages set by id.
        redisStore.sadd('ms:' + channelId, message.id);

        // Extend channel ttl
        redisStore.multi().hgetall(channelId).execAsync().then(function(result) {
            // If Channel found
            if(result.length > 0) {
                var channel = result[0];
                // If message TTL > channel TTL -> reset Channel TTL
                if(message.expiresOn > channel.expiresOn) {
                    // Extend Channel ttl
                    var distance = message.expiresOn - channel.expiresOn;
                    redisStore.ttlAsync(channelId) //Read time to live
                        .bind({}) // Initialize a new (empty) this object for data exchange between all promises.
                        .then(function (ttl) {
                            // Calculate and store new time to life duration for redis key.
                            this.ttl = Number(ttl) + Math.floor(distance/1000);
                            return redisStore.expireAsync(channelId, this.ttl);
                        })
                        .then(function () {
                            // Calculate new expiration date for message object.
                            this.expiresOn = message.expiresOn;
                            return redisStore.hsetAsync(channelId, 'expiresOn', this.expiresOn);
                        })
                        .then(function () {
                            // Append channel to request for post processing.
                            req.channelExtend = {
                                id: channelId,
                                expiresOn: this.expiresOn
                            };

                            // Create message
                            redisStore.multi() //Start atomic transactions
                                .hmset(message.id, message)
                                .expire(message.id, 15*60) // Plus 15 min.
                                .execAsync() //Execute atomic transactions
                                .then(function (result) {
                                    logger.info('POST Message:', message);
                                    message.expiresOn = message.expiresOn.toString();
                                    message.createdOn = message.createdOn.toString();
                                    // Append message to request for post processing.
                                    req.message = message;
                                    return res.status(201).send(message);
                                })
                                .error(function (error) {
                                    logger.error('POST Message:', error);
                                    return res.status(500).send(error);
                                });
                        })
                } else {
                    // Create message
                    redisStore.multi() //Start atomic transactions
                        .hmset(message.id, message)
                        .expire(message.id, 15*60) // Plus 15 min.
                        .execAsync() //Execute atomic transactions
                        .then(function (result) {
                            logger.info('POST Message:', message);
                            message.expiresOn = message.expiresOn.toString();
                            message.createdOn = message.createdOn.toString();
                            // Append message to request for post processing.
                            req.message = message;
                            return res.status(201).send(message);
                        })
                        .error(function (error) {
                            logger.error('POST Message:', error);
                            return res.status(500).send(error);
                        });
                }
            } else {
                return res.status(404).send('Channel not found');
            }
        }).error(function(err){
            return res.status(500).send(err);
        });
        
    });

    router.put('/channels/:channelId/messages/:messageId', function (req, res, next) {
        //Extend lifetime
        var messageId = req.params.messageId;
        console.log(messageId);

        redisStore.ttlAsync(messageId) //Read time to live
            .bind({}) //Initialize a new (empty) this object for data exchange between all promises
            .then(function (ttl) {
                //Calculate and store new time to life duration for redis key.
                this.ttl = Number(ttl) + 5*60;
                return redisStore.expireAsync(messageId, this.ttl);
            })
            .then(function () {
                // Calculate new expiration date for message object.
                var exp = Date.now();
                this.expiresOn = exp + this.ttl*1000;
                return redisStore.hsetAsync(messageId, 'expiresOn', this.expiresOn);
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