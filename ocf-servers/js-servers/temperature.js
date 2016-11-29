var debuglog = require('util').debuglog('temperature'),
    temperatureResource,
    sensorPin,
    beta = 3975, // Value of the thermistor
    resourceTypeName = 'oic.r.temperature',
    resourceInterfaceName = '/a/temperature',
    notifyObserversTimeoutId,
    exitId,
    observerCount = 0,
    hasUpdate = false,
    temperature = 0,
    desiredTemperature = 0;

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

// Units for the temperature.
var units = {
    C: "C",
    F: "F",
    K: "K",
};

// Require the MRAA library.
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup Temperature sensor pin.
function setupHardware() {
    if (mraa) {
       sensorPin = new mraa.Aio(1);
    }
}

// Get the range property value for temperature
// based on the unit attribute.
function getRange(tempUnit) {
    var range;

    switch (tempUnit) {
        case units.F:
            range = "-40,257";
            break;
        case units.K:
            range = "233.15,398.15";
            break;
        case units.C:
        default:
            range = "-40,125"
            break;
    }

    return range;
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties(tempUnit) {
    if (mraa) {
        var raw_value = sensorPin.read();
        var temp = 0.0;

        // Get the resistance of the sensor
        var resistance = (1023 - raw_value) * 10000 / raw_value;
        var Ktemperature = 1 / (Math.log(resistance / 10000) / beta + 1 / 298.15);

        switch (tempUnit) {
            case units.F:
                temperature = Math.round(((Ktemperature - 273.15) * 9.0 / 5.0 + 32.0) * 100) / 100;
                debuglog("Temperature in Fahrenheit: ", temperature);
                break;
            case units.K:
                temperature = Math.round(Ktemperature * 100) / 100;
                debuglog("Temperature in Kelvin: ", temperature);
                break;
            case units.C:
            default:
                temperature = Math.round((Ktemperature - 273.15) * 100) / 100;
                debuglog("Temperature in Celsius: ", temperature);
                break;
        }

        if (temperature >= desiredTemperature)
            hasUpdate = true;
    } else {
        // Simulate real sensor behavior. This is useful
        // for testing on desktop without mraa.
        temperature = temperature + 0.1;
        debuglog("Temperature: ", temperature);
        hasUpdate = true;
    }

    // Format the properties.
    var properties = {
        rt: resourceTypeName,
        id: 'temperature',
        temperature: temperature,
        units: tempUnit,
        range: getRange(tempUnit)
    };

    return properties;
}

function updateProperties(properties) {
    var range_temp = getRange(units.C).split(',');
    var min = parseInt(range_temp[0]);
    var max = parseInt(range_temp[1]);

    if (properties.temperature < min || properties.temperature > max)
        return false;

    desiredTemperature = properties.temperature;
    debuglog('Desired value: ', desiredTemperature);

    return true;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties(units.C);

    notifyObserversTimeoutId = null;
    if (hasUpdate) {
        temperatureResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', temperature);
        temperatureResource.notify().catch(
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
    if (request.queryOptions && request.queryOptions.units) {
        if (!(request.queryOptions.units in units)) {
            // Format the error properties.
            var error = {
                id: 'temperature',
                units: request.queryOptions.units
            };

            request.sendError(error);
            return;
        }

        temperatureResource.properties = getProperties(request.queryOptions.units);
    } else {
        temperatureResource.properties = getProperties(units.C);
    }

    request.respond(temperatureResource).catch(handleError);

    if ("observe" in request) {
        observerCount += request.observe ? 1 : -1;
        if (observerCount > 0)
            setTimeout(notifyObservers, 200);
    }
}

function updateHandler(request) {
    var ret = updateProperties(request.res);

    if (!ret) {
        // Format the error properties.
        var error = {
            id: 'temperature',
            range: getRange(units.C)
        };

        request.sendError(error);
        return;
    }

    temperatureResource.properties = getProperties(units.C);
    request.respond(temperatureResource).catch(handleError);

    if (observerCount > 0)
        setTimeout(notifyObservers, 200);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Temperature Sensor',
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

        // Setup Temperature sensor pin.
        setupHardware();

        debuglog('Create Temperature resource.');

        // Register Temperature resource
        device.server.register({
            resourcePath: resourceInterfaceName,
            resourceTypes: [ resourceTypeName ],
            interfaces: [ 'oic.if.baseline' ],
            discoverable: true,
            observable: true,
            properties: getProperties(units.C)
        }).then(
            function(resource) {
                debuglog('register() resource successful');
                temperatureResource = resource;

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
    debuglog('Delete temperature Resource.');

    if (exitId)
        return;

    // Unregister resource.
    temperatureResource.unregister().then(
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
