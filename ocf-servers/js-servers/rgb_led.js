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

var debuglog = require('util').debuglog('rgb_led'),
    rgbLEDResource,
    sensorPin,
    sensorState = false,
    exitId,
    observerCount = 0,
    resourceTypeName = 'oic.r.colour.rgb',
    resourceInterfaceName = '/a/rgbled',
    range = [0,255],
    rgbValue = [0,0,0],
    clockPin,
    dataPin;

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

// Setup LED pin.
function setupHardware() {
    if (!mraa)
        return;

    clockPin = new mraa.Gpio(7);
    clockPin.dir(mraa.DIR_OUT);
    dataPin = new mraa.Gpio(8);
    dataPin.dir(mraa.DIR_OUT);

    setColourRGB(0, 0, 0);
}

function clk() {
    if (!mraa)
        return;

    clockPin.write(0);
    clockPin.write(1);
}

function sendByte(b) {
    if (!mraa)
        return;

    // send one bit at a time
    for (var i = 0; i < 8; i++) {
        if ((b & 0x80) != 0)
            dataPin.write(1);
        else
            dataPin.write(0);

        clk();
        b <<= 1;
  }
}

function sendColour(red, green, blue) {
    // start by sending a byte with the format "1 1 /B7 /B6 /G7 /G6 /R7 /R6"
    var prefix = 0xC0;

    if ((blue & 0x80) == 0) prefix |= 0x20;
    if ((blue & 0x40) == 0) prefix |= 0x10;
    if ((green & 0x80) == 0) prefix |= 0x08;
    if ((green & 0x40) == 0) prefix |= 0x04;
    if ((red & 0x80) == 0) prefix |= 0x02;
    if ((red & 0x40) == 0) prefix |= 0x01;

    sendByte(prefix);

    sendByte(blue);
    sendByte(green);
    sendByte(red);
}

// Set the RGB colour
function setColourRGB(red, green, blue) {
    // send prefix 32 x "0"
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);

    sendColour(red, green, blue);

    // terminate data frame
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
}

function checkColour(colour) {
    var min = range[0];
    var max = range[1];

    if (colour >= min && colour <= max)
        return true;

    return false;
}

// This function parce the incoming Resource properties
// and change the sensor state.
function updateProperties(properties) {
    var input = properties.rgbValue;
    if (!input || !mraa)
        return;

    var r = parseInt(input[0]);
    var g = parseInt(input[1]);
    var b = parseInt(input[2]);
    if (!checkColour(r) || !checkColour(g) || !checkColour(b))
        return;

    setColourRGB(r, g, b);
    rgbValue = input;

    debuglog('Update received. value: ', rgbValue);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'rgbled',
        rgbValue: rgbValue,
        range: range
    };

    debuglog('Send the response. value: ', rgbValue);
    return properties;
}

// Set up the notification loop
function notifyObservers(request) {
    rgbLEDResource.properties = getProperties();

    rgbLEDResource.notify().catch(
        function(error) {
            debuglog('Notify failed with error: ', error);
        });
}

// Event handlers for the registered resource.
function retrieveHandler(request) {
    rgbLEDResource.properties = getProperties();
    request.respond(rgbLEDResource).catch(handleError);

    if ("observe" in request) {
        observerCount += request.observe ? 1 : -1;
        if (observerCount > 0)
            setTimeout(notifyObservers, 200);
    }
}

function updateHandler(request) {
    updateProperties(request.data);

    rgbLEDResource.properties = getProperties();
    request.respond(rgbLEDResource).catch(handleError);
    if (observerCount > 0)
        setTimeout(notifyObservers, 200);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home RGB LED',
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
        // Setup RGB LED sensor pin.
        setupHardware();

        debuglog('Create RGB LED resource.');

        // Register RGB LED resource
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
                rgbLEDResource = resource;

                // Add event handlers for each supported request type
                resource.onretrieve(retrieveHandler);
                resource.onupdate(updateHandler);
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
    debuglog('Delete RGB LED Resource.');

    if (exitId)
        return;

    // Turn off led before we tear down the resource.
    if (mraa) {
        rgbValue = [0,0,0];
        setColourRGB(0, 0, 0);
    }

    // Unregister resource.
    rgbLEDResource.unregister().then(
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
