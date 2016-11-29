// Copyright 2016 Intel Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var client = require('iotivity-node').client,
    debuglog = require('util').debuglog('gateway-server'),
    fs = require('fs'),
    rules = require('./rules-engine/rules_engine'),
    args = process.argv.slice(2),
    connectionList = {},
    notifyObserversTimeoutId,
    resourcesList = {},
    webComponents = {};

var options = {
    help: false,
    rulesEngineMode: false
};

const usage = "Usage: node uart_sample.js [options]\n" +
    "options: \n" +
    "  -h, --help \n" +
    "  -r, --rulesengine\n";

for (var i = 0; i < args.length; i++) {
    var arg = args[i];

    switch (arg) {
        case "-h":
        case "--help":
            options.help = true;
            break;
        case "-r":
        case "--rulesengine":
            options.rulesEngineMode = true;
            break;
        default:
            break;
    }
}

if (options.help == true) {
    console.log(usage);
    process.exit(0);
}

debuglog(__dirname + "/rules-engine/rules.json");
var jsonRulesConfig = fs.readFileSync(__dirname + "/rules-engine/rules.json", "utf8");
debuglog(jsonRulesConfig);
rulesEngine = rules.createRulesEngine(jsonRulesConfig);

// Start webserver for 3D UI only in default mode.
if (!options.rulesEngineMode) {
    var express = require('express'),
        http = require('http'),
        webSocketServer = require('websocket').server,
        serverPort = 8080,
        app = express();
        server = http.createServer(app);

    app.use(express.static(__dirname + '/webui'));

    // systemd socket activation support
    if (process.env.LISTEN_FDS) {
        // The first passed file descriptor is fd 3
        var fdStart = 3;
        serverPort = {fd: fdStart};
    }
    server.listen(serverPort);

    wsServer = new webSocketServer({
        httpServer: server,
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
       autoAcceptConnections: false
    });

    function originIsAllowed(origin) {
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }

    wsServer.on('request', function(request) {
        if (!originIsAllowed(request.origin)) {
            // Make sure we only accept requests from an allowed origin
            request.reject();
            debuglog((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
            return;
        }

        var connection = request.accept('echo-protocol', request.origin);

        debuglog((new Date()) + ' Connection accepted.');

        if (!(connection.remoteAddress in connectionList)) {
            connectionList[connection.remoteAddress] = connection;

            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    debuglog('Received Message: ' + message.utf8Data);

                    parseInComingRequest(JSON.parse(message.utf8Data), connection);
                }
            });
            connection.on('close', function(reasonCode, description) {
                debuglog((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
                delete connectionList[connection.remoteAddress];
            });
        }
    });
}

function parseInComingRequest(message, connection) {
     if (message.Event == "update") {
         updateProperties(message.Type, message.att);
     }
}

function updateWebClients(msg, eventType) {
    outmesg_list = [];
    outmesg = {};
    outmesg["Type"] = msg.id;
    outmesg["Event"] = eventType;
    outmesg["att"] = msg;

    outmesg_list.push(outmesg);

    debuglog(JSON.stringify(outmesg_list));
    var newEvents = rulesEngine.processEvents(JSON.stringify(outmesg_list));
    if (newEvents) {
        var actions = JSON.parse(newEvents);
        for (var action in actions) {
            parseInComingRequest(actions[action]);
        }
    }

    if (!options.rulesEngineMode) {
        for (var key in connectionList) {
            debuglog(key);
            var connection = connectionList[key];
            connection.sendUTF(JSON.stringify(outmesg_list));
        }
    }
}

//------------------------------------------------------------------------------------------------IOT-------------------------------------------------------

function updateProperties(Type, values)
{
    if (Type in webComponents) {
        resourceId = webComponents[Type];
        resource = resourcesList[resourceId];
        if (!resource)
            return;

        debuglog('----------------------------------------------');
        debuglog('Sending Update to ' + Type + ' resourceId:' + resourceId);

        resource.properties = values;
        client.update(resource);
    } else {
        debuglog('No ' + Type + ' online');
    }
}

//when a server seends data to gatway
function obsReqCB(payload, resourceId) {
    var eventType;
    if ("id" in payload) {
        if (!(payload.id in webComponents)) {
            eventType = 'add';
            webComponents[payload.id] = resourceId;
         } else {
            eventType = 'update';
         }
    }

    updateWebClients(payload, eventType);
}


//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function resourceUpdate(resource) {
    if ('properties' in resource) {
        debuglog('Resource updated:' + JSON.stringify(resource.properties, null, 4));

        var resourceId = resource.deviceId + ":" + resource.resourcePath;
        obsReqCB(resource.properties, resourceId);
    }
}

// Stop observing the resource when it has been deleted from the OCF network.
function deleteResource() {
    var id = this.deviceId + ":" + this.resourcePath;
    debuglog('Client: deleteResource: ' + id);

    var resource = resourcesList[id];
    if (resource) {
        resource.removeListener("update", resourceUpdate);
        delete resourcesList[id];
    }
}

// Stop observing resources when a device is lost.
client.on("devicelost", function(device) {
    debuglog('Client: devicelost: ' + device.uuid);

    for (var index in resourcesList) {
        var resource = resourcesList[index];
        if (resource && resource.deviceId === device.uuid) {
            resource.removeListener("update", resourceUpdate);
            delete resourcesList[index];
        }
    }
});

// Add a listener that will receive the results of the discovery
client.on("resourcefound", function(resource) {
    // If the resource has identified by deviceId and path,
    // then we don't start observe.
    var resourceId = resourcesList[resource.deviceId + ":" + resource.resourcePath];

    if (!resourceId && resource.observable) {
        debuglog('Resource found:' + JSON.stringify(resource, null, 4));
        resourcesList[resource.deviceId + ":" + resource.resourcePath] = resource;

        // Start observing the resource.
        resource.on("update", resourceUpdate);

        // Start observing the resource deletion.
        // FIXME: To be uncommented when iotivity-node issue#92 is fixed.
        //resource.on("delete", deleteResource);
    }
});

function discoverResources() {
    debuglog('Discover resources.');

    client.findResources().catch(function(error) {
        debuglog('Client: findResources() failed with ' + error);
    });
}

// Discover resources.
discoverResources();

// Exit gracefully when interrupted
process.on('SIGINT', function() {
    debuglog('SIGINT: Quitting...');

    // Tear down the processing loop
    if (notifyObserversTimeoutId) {
        clearTimeout(notifyObserversTimeoutId);
        notifyObserversTimeoutId = null;
    }

    // Stop observing
    for (var index in resourcesList) {
        var resource = resourcesList[index];
        if (resource) {
            resource.removeListener("update", resourceUpdate);
            // FIXME: To be uncommented when iotivity-node issue#92 is fixed.
            //resource.removeListener("delete", deleteResource);
        }
    }

    // Exit
    process.exit(0);
});
