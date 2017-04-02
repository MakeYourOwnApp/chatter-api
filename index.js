/**
 * Created by mz on 14.09.16.
 */

/**
 * Startup server with 'redis-server --notify-keyspace-events Ex'
 * TODO: register Ex events in config
 */

// Import all configurations from .env file.
const dotenv = require('dotenv').load();

// Initialize Express Server.
var express = require('express');
var app = express();

// Read certificate.
const fs = require('fs');
// const pkey = fs.readFileSync('/root/mooc.key');
// const pcert = fs.readFileSync('/root/cert-7835386732846228.pem');
// const options = {
//     key : pkey,
//     cert : pcert
// };

// Initialize HTTPS server.
var https = require('http').Server(app); // For local development
//var https = require('https').createServer(options, app);


// Initialize the logger.
var logger = require('./Services/LogService')(app).loggerForEnvironment(process.env.PORT);

// Initialize Body Parser.
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended : false })); // Middleware for parsing application/json

// Initialize the Redis Store.
var redisStore = require('./Services/RedisStore')(logger);
// Initialize the Socket Service.
var socket = require('./Services/SocketClientService')(https, redisStore, logger);
// Initialize the Redis Event Subscriber.
var redisSubscriber = require('./Services/RedisSubscriber')(redisStore, socket, logger);


// Initialize method override. This will allow to use PUT and DELETE options also at clients which normally don't support them.
app.use(require('method-override')());

// Add HTTP headers.
app.use(function(req, res, next) {

    // Websites you wish to allow to connect.
    res.header('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow.
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');

    // Request headers you wish to allow.
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    // If OPTIONS return immediately.
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    // Pass to next layer of middleware.
    next();
});

// Initialize Public Routes which do not require authentication.
app.use('/', require('./Services/PostProcessor.js')(socket, logger), require('./Routes/Routes.js')(redisStore, redisSubscriber, logger));

// Static web server.
app.use(express.static('public'));

// Get server port from .env
const port = process.env.PORT || 3131;

// Start web server.
https.listen(port, function () {
    logger.info('Server listening on *:' + port);
});
