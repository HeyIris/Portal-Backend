let express = require('express');
let ShareDB = require('sharedb');
let otText = require('ot-text');
let WebSocket = require('ws');
let WebSocketStream = require('../public/javascripts/WebSocketStream');
let Constant = require("../public/javascripts/DataConstants");

'use strict';

ShareDB.types.register(otText.type);

var portals = [];

const share = new ShareDB();
//const stream = new WebSocketJSONStream(ws);

// Register new op middleware
share.use('op', (request, callback) => {
    callback();
    setTimeout(() => {
        let ws = request.agent.stream.ws; // ?
        let cursors = portals[ws.sessionId].cursors;
        if (typeof cursors !== 'undefined') {
            console.log('Broadcasting ' + ws.clientId + '\'s cursors'); /////////////
            for (let path in cursors) {
                if (cursors.hasOwnProperty(path) && JSON.parse(cursors[path]).clientId === ws.clientId) {
                    console.log(path);
                    broadcastMsg(cursors[path], ws);
                }
            }
            cursors = {};
        }
    }, 0);
});

startServer();

function startServer() {
    // Create a WebSocket Server
    // and connect any incoming WebSocket connection to ShareDB
    const wss = new WebSocket.Server({
        port: 9090,
        perMessageDeflate: {
            zlibDeflateOptions: { // See zlib defaults.
                chunkSize: 1024,
                memLevel: 7,
                level: 3,
            },
            zlibInflateOptions: {
                chunkSize: 10 * 1024
            },
            // Other options settable:
            clientNoContextTakeover: true, // Defaults to negotiated value.
            serverNoContextTakeover: true, // Defaults to negotiated value.
            clientMaxWindowBits: 10, // Defaults to negotiated value.
            serverMaxWindowBits: 10, // Defaults to negotiated value.
            // Below options specified as default values.
            concurrencyLimit: 10, // Limits zlib concurrency for perf.
            threshold: 1024, // Size (in bytes) below which messages should not be compressed.
        }
    }, () => {
        console.log('WebSocket Server Created.');
    });

    wss.on('connection', function connect(ws) {
        const stream = new WebSocketStream(ws);

        ws.on('message', function (msg) { // receive text data
            try {
                console.log("Message received: " + msg);
                judgeType(ws, msg);
            } catch (err) {
                console.log("Errors occur:" + err);
            }
        });

        ws.on('close', (code, reason) => {
            // socket client closed due to server closed, do not broadcast
            if (code === 1006) {
                return;
            }
            if (portals[ws.sessionId].users[ws.clientId]) {
                portals[ws.sessionId].users[ws.clientId] = null;
                console.log('We just lost one connection: ' + ws.clientId + ' from ' + ws.sessionId);
                console.log('Now ' + ws.sessionId + ' has ' + portals[ws.sessionId].users.length + ' connection(s)');
                console.log('\n');
                let msg = {
                    a: Constant.META,
                    type: Constant.TYPE_CLOSE_SOCKET,
                    clientId: ws.clientId
                };
                broadcastMsg(JSON.stringify(msg), ws);
            }
        });

        share.listen(stream);
        console.log('Got one connection...\n');
    });

    process.on('SIGINT', () => {
        wss.close(() => {
            process.exit();
        });
    });
}

function logFiles(files) {
    console.log('current files: ');
    console.log(files);
    console.log('\n');
}

function judgeType(ws, msg) {
    let data = JSON.parse(msg);
    if (data.a === Constant.META) {
        console.log('Received meta data:' + JSON.stringify(data) + '\n');
        let files = portals[ws.sessionId] ? portals[ws.sessionId].files : null;

        switch (data.type) {
            /*
            *
            *   Needed:
            *   { clientId, sessionId }
            *
            */
            case Constant.TYPE_INIT:
                // create or join a session
                ws.createOrJoinSession(data);
                ws.send(JSON.stringify(portals[ws.sessionId].files));
                return;
            /*
            *
            *   Needed:
            *   { path }
            *
            */
            case Constant.TYPE_MOVE_CURSOR:
                let cursors = portals[ws.sessionId].cursors;
                cursors[data.path] = msg;
                return;
            /*
            *
            *   Needed:
            *   { uri, userId }
            *
            */
            case Constant.TYPE_OPEN_FILE:
                if (!files[data.uri]) {
                    files[data.uri] = {
                        uri: data.uri,
                        grammer: data.grammer,
                        occupier: [],
                        activeUser: []
                    };
                }
                files[data.uri].occupier.push(data.userId);
                files[data.uri].activeUser.push(data.userId);
                console.log(data.uri + ' added\n');
                logFiles(portals[ws.sessionId].files);
                break;
            /*
            *
            *   Needed:
            *   { path, userId }
            *
            */
            case Constant.TYPE_CLOSE_FILE:
                // TODO: Refactor
                let index = files[data.path].activeUser.indexOf(data.userId);
                if (index !== -1) {
                    files[data.path].activeUser.splice(index, 1);
                }
                files[data.path].occupier.splice(files[data.path].occupier.indexOf(data.userId), 1);

                if (!files[data.path].occupier.length) {
                    files[data.path] = null;
                    console.log(data.path + ' removed.');
                    logFiles(portals[ws.sessionId].files);
                } else {
                    logFiles(portals[ws.sessionId].files[data.path]);
                }
        }
        // other meta changes: cursor position, text selection
        // and open/save/close file
        broadcastMsg(msg, ws);
    }
    else {
        // OT
        console.log(data);
        stream.push(JSON.parse(msg));
    }
}

function broadcastMsg(msg, ws) {
    let sockets = portals[ws.sessionId].users;
    Object.keys(sockets).forEach(function (userId) {
        if (sockets[userId].readyState === WebSocket.OPEN && (userId !== ws.getId())) {
            console.log('Broadcasting msg to ' + userId + '\n');
            console.log(msg);
            console.log('\n');
            setTimeout(() => {
                sockets[userId].ws.send(msg);
            }, 0);
        }
    });
}

WebSocket.prototype.createOrJoinSession = function (data) {
    let sessionId = data.sessionId;
    let clientId = data.clientId;
    this.sessionId = sessionId;
    this.clientId = clientId;
    if (typeof portals[sessionId] === 'undefined') {
        let portal = {
            id: sessionId,
            files: {},
            users: {},
            cursors: {} // TODO: remove this
        };
        portals[sessionId] = portal;
    }
    portals[sessionId].users[clientId] = {
        id: clientId,
        ws: this
    };
    console.log('Session ' + sessionId + ' adds ' + clientId + '\n');
};

WebSocket.prototype.getId = function () {
    return this.upgradeReq.headers['sec-websocket-key'];
};

const router = express.Router();

module.exports = router;
