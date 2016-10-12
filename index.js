/**
 * Created by mz on 14.09.16.
 */

/**
 * Startup server with 'redis-server --notify-keyspace-events Ex'
 * TODO: register Ex events in config
 */

//Helpers
var Promise = require("bluebird"); //Promise API

//Express server
var express = require('express');
var app = express();
var http = require('http').Server(app);

//Json
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded()); // Middleware for parsing application/json

//Socket server
var io = require('socket.io')(http);

//Redis storage
var redis = require("redis");
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);
var r = redis.createClient();
var subscriber = redis.createClient();
const EVENT_EXPIRED = '__keyevent@0__:expired';

app.get('/channels', function (req, res) {
    r.smembersAsync("channels")
        .then(function (channelsSet) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write("["); //start array
            return channelsSet; //resolve promise
        })
        .each(function (channelName, index, length) {
            return r.hgetallAsync("channels:" + channelName).then(function (channel) {
                res.write(JSON.stringify(channel)); //Add object
                if (index < length - 1) res.write(","); //Concatenate objects
            });
        })
        .finally(function () {
            res.write("]"); //end array
            res.end(); //close stream
        });
});

app.get('/channels/:name', function (req, res) {
    res.send('hello ' + req.params.name + '!');
});

app.post('/channels/:channel', function (req, res) {
    var channel = req.params.channel;
    var post = req.body;

    //Sanity checks
    if (!post.text || !post.longitude || !post.latitude || !post.creator) {
        res.status(400).send('Post incomplete, has to contain "text", "longitude", "latitude", and "creator"');
        return;
    }

    /*//Store in channels set todo: ordered set by date
     r.sadd("channels", name);
     //Store channel in hash
     r.hmsetAsync("channels:" + name, {
     name: name,
     time: Date.now(),
     creator: 'fewest.slime.hurt'
     }).then(function () {
     r.expire("channels:" + name, 15)
     }).finally(function () {
     res.sendStatus(200);
     io.emit('/channels/create', name);
     });*/

    //Add timestamp and channel
    post.created = Date.now();
    post.expires = post.created + 15000;
    post.channel = channel;

    //Create post
    r.multi() //Start atomic transactions
        .hmset('posts:' + post.created + "." + post.creator, post)
        .expire('posts:' + post.created + "." + post.creator, 15)
        .execAsync() //Execute atomic transactions
        .then(function (result) {
            res.sendStatus(200);
            io.emit('post', post);
        })
        .error(function (error) {
            res.status(500).send(err);
        });
});

app.put('/posts/:postId', function (req, res) {
    //Extend lifetime
    var postKey = "posts:" + req.params.postId;

    r.ttlAsync(postKey) //Read time to live
        .bind({}) //Initialize a new (empty) this object for data exchange between all promises
        .then(function (ttl) {
            //Calculate and store new duration
            this.ttl = Number(ttl) + 5;
            return r.expireAsync(postKey, this.ttl);
        })
        .then(function () {
            //Calculate new expiration
            this.expires = Date.now() + (this.ttl * 1000);
            return r.hsetAsync(postKey, 'expires', this.expires);
        })
        .then(function () {
            //Broadcast new expiration
            io.emit('extend', {id: req.params.postId, expires: this.expires});
            //OK
            res.sendStatus(200);
        })
        .error(function(){
            res.status(500).send(err);
        });
});

subscriber.on('pmessage', function (pattern, event, msg) {
    if (event == EVENT_EXPIRED) {
        var item = msg.split(":")[1];
        //console.log('expired', item);
        //r.srem("channels", item);
        io.emit('expire', item);
    }
});
subscriber.psubscribe(EVENT_EXPIRED);

//Static web server
app.use(express.static('public'));

//Start web server
http.listen(3131, function () {
    console.log('listening on *:3131');
});
