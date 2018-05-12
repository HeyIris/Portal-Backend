let express = require('express');
let ShareDB = require('sharedb');
let otText = require('ot-text');
let WebSocket = require('ws');
let WebSocketStream = require('../public/javascripts/WebSocketStream');
//let WebSocketJSONStream = require('websocket-json-stream');

ShareDB.types.register(otText.type);
allSessions = [];

const share = new ShareDB();
//const stream = new WebSocketJSONStream(ws);

// Register new op middleware
share.use('op', (request, callback) => {
    callback();
    // setTimeout(() => {
    //     let ws = request.agent.stream.ws; // ?
    //     let cursors = allSessions[ws.sessionId].cursors;
    //     if (typeof cursors !== 'undefined') {
    //         console.log('Broadcasting ' + ws.clientId + '\'s cursors'); /////////////
    //         for (let path in cursors) {
    //             if (cursors.hasOwnProperty(path) && JSON.parse(cursors[path]).clientId === ws.clientId) {
    //                 console.log(path);
    //                 broadcastMsg(cursors[path], ws);
    //             }
    //         }
    //         cursors = {};
    //     }
    // }, 0);
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
            if (msg instanceof ArrayBuffer) {
                console.log("Receive: ArrayBuffer\n");
                return;
            // } else if (msg instanceof Blob) {
            //     console.log("Receive: Blob\n");
            //     return;
            }
            let data = JSON.parse(msg);

            if (data.a === 'meta') {
                console.log('Received meta data:' + JSON.stringify(data) + '\n');
                if (data.type === 'init') {
                    // create or join a session
                    ws.createOrJoinSession(data);
                    ws.send(JSON.stringify(allSessions[ws.sessionId].tabs));
                } else {
                    // tab changes: add or remove tab
                    let logTabs = false;

                    if (data.type === 'editorClosed') {
                        let tabs = allSessions[ws.sessionId].tabs;
                        let index = tabs.indexOf(data.path);
                        if (index > -1) {
                            tabs.splice(index, 1);
                            console.log(data.path + ' removed.');
                            logTabs = true;
                        }

                    } else if (data.type === 'addTab') {
                        let tabs = allSessions[ws.sessionId].tabs;
                        if (tabs.indexOf(data.uri) !== -1) {
                            return;
                        }
                        tabs.push(data.uri);
                        logTabs = true;
                        console.log(data.uri + ' added');

                    } else if (data.type === 'cursorMoved') {
                        let cursors = allSessions[ws.sessionId].cursors;
                        cursors[data.path] = msg;
                        return;
                    }

                    if (logTabs) {
                        console.log('current tabs: ');
                        console.log(allSessions[ws.sessionId].tabs);
                        console.log('\n');
                    }
                    // other meta changes: cursor position, text selection
                    // and open/save/close file
                    broadcastMsg(msg, ws);
                }
            } else {
                // OT
                console.log(data);
                stream.push(JSON.parse(msg));
            }
        });

        ws.on('close', (code, reason) => {
            // socket client closed due to server closed, do not broadcast
            if (code === 1006) {
                return;
            }
            let index = allSessions[ws.sessionId].wss.indexOf(ws);
            if (index > -1) {
                allSessions[ws.sessionId].wss.splice(index, 1);
                console.log('We just lost one connection: ' + ws.clientId + ' from ' + ws.sessionId);
                console.log('Now ' + ws.sessionId + ' has ' + allSessions[ws.sessionId].wss.length + ' connection(s)');
                console.log('\n');
                let msg = {
                    a: 'meta',
                    type: 'socketClose',
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
};

function broadcastMsg(msg, ws) {
    let sockets = allSessions[ws.sessionId].wss;
    sockets.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN && (socket.getId() !== ws.getId())) {
            console.log('Broadcasting msg to ' + socket.clientId + '\n');
            console.log(msg);
            console.log('\n');
            setTimeout(() => {
                socket.send(msg);
            }, 0);
        }
    });
}

WebSocket.prototype.createOrJoinSession = function (data) {
    let sessionId = data.sessionId;
    let clientId = data.clientId;
    this.sessionId = sessionId;
    this.clientId = clientId;
    if (typeof allSessions[sessionId] === 'undefined') {
        let session = {};
        session.wss = [];
        session.tabs = [];
        session.cursors = {};
        allSessions[sessionId] = session;
    }
    allSessions[sessionId].wss.push(this);
    console.log('Session ' + sessionId + ' adds ' + clientId + '\n');
};

WebSocket.prototype.getId = function () {
    return this.upgradeReq.headers['sec-websocket-key'];
};

const router = express.Router();

module.exports = router;
