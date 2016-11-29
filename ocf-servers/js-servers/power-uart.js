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

var debuglog = require('util').debuglog('power-uart'),
    powerResource,
    uart,
    resourceTypeName = 'oic.r.energy.consumption',
    resourceInterfaceName = '/a/power',
    notifyObserversTimeoutId,
    exitId,
    hasUpdate = false,
    observerCount = 0,
    power1 = 100,  // For simulation only
    power2 = 1000; // Ditto

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

// Default: MinnowBoard MAX/Turbot, raw mode
var dev = "/dev/ttyUSB0";
// e.g., node power-uart.js /dev/ttyS0
var args = process.argv.slice(2);
args.forEach(function(entry) {
    dev = entry;
});

// Setup UART
function setupHardware() {
    if (mraa) {
        uart = new mraa.Uart(dev);
        uart.setBaudRate(115200);
        uart.setMode(8, 0, 1);
        uart.setFlowcontrol(false, false);
    }
}

// Read simple json records from the uart.
// The format of the incoming UART data is:
//   {"ch-1": 0, "ch-2": 0}
// Since the UART is constanty sending data we need to:
//   - sync to the start of the record
//   - read all the records but use only the last one
// TODO: we might want to add simple protocol to UART, like sending a read cmd.
function readJsonFromUart() {

    var start = false; end = false;

    var json = "", last = "", count = 0;

    while (uart.dataAvailable(0)) {
        var ch = uart.readStr(1);
        count++
        if (ch == '{')
            start = true;
        else if (ch == '}' && start == true)
            end = true;

        if (start == true)
            json += ch;

        if (start == true && end == true) {
            last = json;
            start = end = false;
            json = "";
        }
        /* In some cases the reading wont stop, make it stop. */
        if (count >= 4096) {
          debuglog("UART read error.");
          break;
        }
    }
    debuglog("read: %d bytes", count);
    return last;
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var data = null;
    var obj = {"ch-1": 0, "ch-2": 0};

    if (mraa) {
        data = readJsonFromUart();
    } else {
        data = "{\"ch-1\": " + power1++ + ", \"ch-2\": " + power2++ + "}";
    }
    if (data != null && data != "") {
        debuglog(data);
        hasUpdate = true;
    }

    try {
        obj = JSON.parse(data);
    }
    catch(e) {
        debuglog("Invalid data: ", e.message);
    }

    // Format the properties.
    var properties =
    {
        rt: resourceTypeName,
        id: 'power',
        power1: obj["ch-1"],
        power2: obj["ch-2"]
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties();

    notifyObserversTimeoutId = null;
    if (hasUpdate) {
        powerResource.properties = properties;
        hasUpdate = false;

        debuglog('Send observe response.');
        powerResource.notify().catch(
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
    powerResource.properties = getProperties();
    request.respond(powerResource).catch(handleError);

    if ("observe" in request) {
        hasUpdate = true;
        observerCount += request.observe ? 1 : -1;
        if (!notifyObserversTimeoutId && observerCount > 0)
            setTimeout(notifyObservers, 200);
    }

}

device.device = Object.assign(device.device, {
    name: 'Smart Home Energy Consumption',
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

        // Setup uart
        setupHardware();

        debuglog('Create Power resource.');

        // Register Power resource
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
                powerResource = resource;

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
    debuglog('Delete Power Resource.');

    if (exitId)
        return;

    // Unregister resource.
    powerResource.unregister().then(
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
