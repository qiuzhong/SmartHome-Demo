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

var debuglog = require('util').debuglog('motion'),
    motionResource,
    sensorPin,
    exitId,
    notifyObserversTimeoutId,
    resourceTypeName = 'oic.r.sensor.motion',
    resourceInterfaceName = '/a/pir',
    observerCount = 0,
    hasUpdate = false,
    noObservers = false,
    sensorState = false;

// Environment variable to enable secure mode.
var secure_mode = process.env.SECURE;
if (secure_mode === '1' || secure_mode === 'true') {
    // We need to create the appropriate ACLs so security will work
    require("./config-tool/json2cbor")([{
        href: resourceInterfaceName,
        rel: "",
        rt: [resourceTypeName],
       "if": ["oic.if.baseline"]
    }]);
}

var device = require('iotivity-node');

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup Motion sensor pin.
function setupHardware() {
    if (!mraa)
        return;

    sensorPin = new mraa.Gpio(5);
    sensorPin.dir(mraa.DIR_IN);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var motion = false;

    if (mraa) {
        if (sensorPin.read() > 0)
            motion = true;
        else
            motion = false;
    } else {
        // Simulate real sensor behavior. This is
        // useful for testing on desktop without mraa.
        motion = !sensorState;
    }

    if (sensorState != motion) {
        hasUpdate = true;
        sensorState = motion;
    }

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'motionSensor',
        value: sensorState
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    properties = getProperties();

    notifyObserversTimeoutId = null;
    if (hasUpdate) {
        motionResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', sensorState);
        motionResource.notify().catch(
            function(error) {
                debuglog('Failed to notify observers with error: ', error);
                if (error.observers.length === 0) {
                    observerCount = 0;
                    if (notifyObserversTimeoutId) {
                        clearTimeout(notifyObserversTimeoutId);
                        notifyObserversTimeoutId = null;
                    }
                }
            });
    }

    // After all our clients are complete, we don't care about any
    // more requests to notify.
    if (observerCount > 0) {
        notifyObserversTimeoutId = setTimeout(notifyObservers, 2000);
    }
}

// Event handlers for the registered resource.
function retrieveHandler(request) {
    motionResource.properties = getProperties();
    request.respond(motionResource).catch(handleError);

    if ("observe" in request) {
        hasUpdate = true;
        observerCount += request.observe ? 1 : -1;
        if (!notifyObserversTimeoutId && observerCount > 0)
            setTimeout(notifyObservers, 200);
    }
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Motion Sensor',
    coreSpecVersion: "1.0.0",
    dataModels: [ "v1.1.0-20160519" ]
});

function handleError(error) {
    debuglog('Failed to send response with error: ', error);
}

device.platform = Object.assign(device.platform, {
    manufacturerName: 'Intel',
    manufactureDate: new Date('Fri Oct 30 10:04:17 (EET) 2015'),
    platformVersion: '1.1.0',
    firmwareVersion: '0.0.1'
});

// Enable presence
device.server.enablePresence().then(
    function() {
        // Setup Motion sensor pin.
        setupHardware();

        debuglog('Create motion resource.');
        // Register Motion resource
        device.server.register({
            resourcePath: resourceInterfaceName,
            resourceTypes: [ resourceTypeName ],
            interfaces: [ 'oic.if.baseline' ],
            discoverable: true,
            observable: true,
            properties: getProperties()
        }).then(
            function(resource) {
                debuglog('register() resource successful');
                motionResource = resource;

                // Add event handlers for each supported request type
                resource.onretrieve(retrieveHandler);
            },
            function(error) {
                debuglog('register() resource failed with: ', error);
            });
    },
    function(error) {
        debuglog('device.enablePresence() failed with: ', error);
    });

// Cleanup on SIGINT
process.on('SIGINT', function() {
    debuglog('Delete Motion Resource.');

    if (exitId)
        return;

    // Unregister resource.
    motionResource.unregister().then(
        function() {
            debuglog('unregister() resource successful');
        },
        function(error) {
            debuglog('unregister() resource failed with: ', error);
        });

    // Disable presence
    device.server.disablePresence().then(
        function() {
            debuglog('device.disablePresence() successful');
        },
        function(error) {
            debuglog('device.disablePresence() failed with: ', error);
        });

    // Exit
    exitId = setTimeout(function() { process.exit(0); }, 1000);
});

