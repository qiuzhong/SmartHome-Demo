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

var debuglog = require('util').debuglog('gas'),
    gasResource,
    sensorPin,
    gasDensity = 0,
    resourceTypeName = 'oic.r.sensor.carbondioxide',
    resourceInterfaceName = '/a/gas',
    notifyObserversTimeoutId,
    exitId,
    observerCount = 0,
    hasUpdate = false,
    gasDetected = false;

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

// Setup Gas sensor pin.
function setupHardware() {
    if (mraa) {
       sensorPin = new mraa.Aio(0);
       sensorPin.setBit(10);
    }
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    if (mraa) {
        val = sensorPin.read();
        density = val * 500 / 1024;

        debuglog('density: %d, threshold: 70', density);
        if (density != gasDensity) {
            if (density > 70 && gasDensity < 70) {
                gasDensity = density;
                gasDetected = true;
                hasUpdate = true;
            } else if (gasDensity > 70 && density < 70) {
                gasDensity = density;
                gasDetected = false;
                hasUpdate = true;
            }
        }
    } else {
        // Simulate real sensor behavior. This is useful
        // for testing on desktop without mraa.
        gasDetected = !gasDetected;
        hasUpdate = true;
    }

    // Format the properties.
    var properties = {
        rt: resourceTypeName,
        id: 'gasSensor',
        value: gasDetected
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties();

    notifyObserversTimeoutId = null;
    if (hasUpdate) {
        gasResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', gasDetected);
        gasResource.notify().catch(
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
    gasResource.properties = getProperties();
    request.respond(gasResource).catch(handleError);

    if ("observe" in request) {
        hasUpdate = true;
        observerCount += request.observe ? 1 : -1;
        if (!notifyObserversTimeoutId && observerCount > 0)
            setTimeout(notifyObservers, 200);
    }
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Gas Sensor',
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
        // Setup Gas sensor pin.
        setupHardware();

        debuglog('Create Gas resource.');

        // Register Gas resource
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
                gasResource = resource;

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
    debuglog('Delete Gas Resource.');

    if (exitId)
        return;

    // Unregister resource.
    gasResource.unregister().then(
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
