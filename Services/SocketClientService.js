'use strict';

module.exports = function (http, redisClient, logger) {

    // Socket Dependencies.
    const socket = require('socket.io');
    const io = socket.listen(http);

    // Socket connection store.
    // TODO: Store connection in redis db.
    const SocketStore = require('./SocketStore');

    // Handle connection request.
    io.on('connection', function (socket) {

        // Log connection.
        logger.info('Socket connect with id: ' + socket.id);

        // Socket disconnect.
        socket.on('disconnect', function () {
            // Log disconnect.
            logger.info('Socket disconnect with id: ' + socket.id);

            // Remove from dictionary
            // var connectionLength = _.size(SocketStore);
            // if(connectionLength > 0) {
            //     var key = _.findKey(SocketStore.connections, function(c) { return c && c.id === socket.id });
            //     if(typeof key !== 'undefined') {
            //         SocketStore.connections[key] = null;
            //         logger.info('Socket was deregistered with id: ' + socket.id);
            //     }
            // }
        });
    });


    return {
        emit: function(event, data) {
            // Emit an Event to the client
            if(!event || !data) {
                return;
            }
            io.emit(event, data);
        },
        on: function(event, callback) {
            // Listen to a Event from client
            if(!event || !callback) {
                return;
            }
            if(typeof callback !== 'function') {
                return;
            }
            io.on(event, callback);
        }
    }
};
