'use strict';
module.exports = function (socket, logger) {

    return function(req, res, next) {
        // Post Processor after request was returned
        res.on('finish', function() {
            if(req.message) {
                logger.info('PostProcessing: New Message.');
                socket.emit('message:new', req.message);
            }
            if(req.messageExtend) {
                logger.info('PostProcessing: Extended Message.');
                req.messageExtend.expiresOn = req.messageExtend.expiresOn.toString();
                socket.emit('message:extend', req.messageExtend);
            }
            if(req.channel) {
                logger.info('PostProcessing: New Channel.');
                socket.emit('channel:new', req.channel);
            }
            if(req.channelExtend) {
                logger.info('PostProcessing: Extended Channel.');
                req.channelExtend.expiresOn = req.channelExtend.expiresOn.toString();
                socket.emit('channel:extend', req.channelExtend);
            }
        });
        next();
    }
};