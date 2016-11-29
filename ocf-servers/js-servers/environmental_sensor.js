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

var	debuglog = require('util').debuglog('environmental_sensor'),
	BLE_DEV_NAME = 'Zephyr Environmental Sensor',
	// UUID of the environmental sensing service
	serviceUuids = ['181a'],
	// UUIDs of interested characteristics
	characteristicUuids = ['2a6e', '2a6f', '2a6d', '2a76'],
	notifyObserversTimeoutId,
	envSensorResource,
	resourceTypeName = 'oic.r.sensor.environment',
	resourceInterfaceName = '/a/env',
	hasUpdate = false,
    exitId,
    observerCount = 0,
	resourceData = {temperature : 0.0,
			humidity : 0.0,
			pressure : 0.0,
			uvIndex : 0},
	sensorData =   {temperature : 0.0,
			humidity : 0.0,
			pressure : 0.0,
			uvIndex : 0},
			simData = 0.0;

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

var noble = '';
try {
	noble = require('noble');
}
catch(e) {
	// proceed to send simulated data if no noble module's found. 
	console.log('No noble module: ' + e.message + '. Switching to simulation mode');
	//process.exit(0);
}

if(noble){
	// intitialize BLE, make sure BT is enabled with 'rfkill unblock bluetooth'
	noble.on('stateChange', function(state) {
		debuglog('on -> stateChange');
		if (state == 'poweredOn') {
			// only search for devices with ESS (enviromental sensing service)
			noble.startScanning(serviceUuids, true);
		} else {
			noble.stopScanning();
		}
	});

	noble.on('scanStart', function() {
		debuglog('on -> scanStart');
	});
 
	noble.on('scanStop', function() {
		debuglog('on -> scanStop');
	});

	noble.on('discover', function(peripheral) {
		debuglog('on -> discover: ' + peripheral);

		if (peripheral.advertisement.localName == BLE_DEV_NAME) {
			noble.stopScanning();
		
			peripheral.on('connect', function() {
				debuglog('on -> connect');
				this.discoverServices(serviceUuids);
			});

			peripheral.on('disconnect', function() {
				debuglog('on -> disconnect');
				noble.startScanning(serviceUuids, true);
			});

			peripheral.connect(function(error) {
				if (error) {
					debuglog('Connection error');
				}   
			});

			peripheral.on('servicesDiscover', function(services) {
				var esService = services[0];
				debuglog('on -> ESS service discovery');

				esService.on('characteristicsDiscover', function(characteristics) {
					var temperatureCharacteristic = null;
					var humidityCharacteristic = null;
					var pressureCharacteristic = null;
					var uvIndexCharacteristic = null;

					if (characteristics.length != 4) {
						return;
					}

					for (var i = 0; i < characteristics.length; i++) {
						if (characteristics[i].uuid == characteristicUuids[0]) {
							temperatureCharacteristic = characteristics[i];
						}
						else if (characteristics[i].uuid == characteristicUuids[1]) {
							humidityCharacteristic = characteristics[i];
						}
						else if (characteristics[i].uuid == characteristicUuids[2]) {
							pressureCharacteristic = characteristics[i];
						}
						else if (characteristics[i].uuid == characteristicUuids[3]) {
							uvIndexCharacteristic = characteristics[i];
						}
					}

					if (temperatureCharacteristic) {
					    temperatureCharacteristic.on('read', function(data, isNotification) {
							sensorData.temperature = (data.readInt8(0) + data.readInt8(1) * 256) / 100;
							debuglog('Temperature = ', sensorData.temperature + ' celcius');
						});

						temperatureCharacteristic.notify(true, function(error) {
							debuglog('Temperature notification ON');
						});
					}

					if (humidityCharacteristic) {
						humidityCharacteristic.on('read', function(data, isNotification) {
							sensorData.humidity = (data.readUInt8(0) + data.readUInt8(1) * 256) / 100;
							debuglog('Humidity = ', sensorData.humidity + ' %');
						});

						humidityCharacteristic.notify(true, function(error) {
							debuglog('Humidity notification ON');
						});
					}

					if (pressureCharacteristic) {
						pressureCharacteristic.on('read', function(data, isNotification) {
							sensorData.pressure = data.readUInt8(0) + data.readUInt8(1) * 256 +
										data.readUInt8(2) * 65536;
							sensorData.pressure /= 1000;
							debuglog('Pressure = ', sensorData.pressure + ' hPa');
						});

						pressureCharacteristic.notify(true, function(error) {
							debuglog('Pressure notification ON');
						});
					}

					if (uvIndexCharacteristic) {
						uvIndexCharacteristic.on('read', function(data, isNotification) {
							sensorData.uvIndex = data.readUInt8(0);
							debuglog('UV Index = ', sensorData.uvIndex);
						});

						uvIndexCharacteristic.notify(true, function(error) {
							debuglog('UV Index notification ON');
						});
					}
				});
			
				esService.discoverCharacteristics(characteristicUuids);
			});
		}
	});
}

function getProperties() {
	if(!noble)
	{
		// Simulate real sensor behavior. This is
		// useful for testing on desktop without noble.
		simData = simData + 0.1;
		sensorData.temperature = simData;
		sensorData.humidity = simData;
		sensorData.pressure = simData;
		sensorData.uvIndex = simData;
	}
	if (resourceData.temperature != sensorData.temperature) {
		resourceData.temperature = sensorData.temperature;
		hasUpdate = true;
	}
	if (resourceData.humidity != sensorData.humidity) {
		resourceData.humidity = sensorData.humidity;
		hasUpdate = true;
	}
	if (resourceData.pressure != sensorData.pressure) {
		resourceData.pressure = sensorData.pressure;
		hasUpdate = true;
	}
	if (resourceData.uvIndex != sensorData.uvIndex) {
		resourceData.uvIndex = sensorData.uvIndex;
		hasUpdate = true;
	}

	var properties =
	{
		rt: resourceTypeName,
		id: 'environmentalSensor',
		temperature: resourceData.temperature,
		humidity: resourceData.humidity,
		pressure: resourceData.pressure,
		uvIndex: resourceData.uvIndex
	};

	return properties;
}

function notifyObservers() {
	properties = getProperties();

    notifyObserversTimeoutId = null;
	if (hasUpdate) {
		envSensorResource.properties = properties;
		hasUpdate = false;

		debuglog('Send out the sensor data');
		envSensorResource.notify().catch(
			function(error) {
				debuglog('Failed to notify observers with error: ', error);
                if (error.observers.length === 0) {
                    observerCount = 0;
					if (notifyObserversTimeoutId) {
						clearTimeout(notifyObserversTimeoutId);
						notifyObserversTimeoutId = null;
					}
				}
			}
		);
	}

	if (observerCount > 0) {
		notifyObserversTimeoutId = setTimeout(notifyObservers, 2000);
	}
}

// Event handlers for the registered resource.
function retrieveHandler(request) {
    envSensorResource.properties = getProperties();
	request.respond(envSensorResource).catch(handleError);

    if ("observe" in request) {
        observerCount += request.observe ? 1 : -1;
        if (observerCount > 0)
		    setTimeout(notifyObservers, 2000);
    }
}

device.device = Object.assign(device.device, {
	name: 'Smart Home Environmental Sensor',
	coreSpecVersion: "1.0.0",
	dataModels: [ "v1.1.0-20160519" ]
});

function handleError(error) {
	debuglog('Failed to send response with error: ', error);
}

device.platform = Object.assign(device.platform, {
	manufacturerName: 'Intel',
	manufactureDate: new Date('Tue Oct 25 12:00:00 (JST) 2016'),
	platformVersion: '1.1.0',
	firmwareVersion: '0.0.1'
});

// Enable presence
device.server.enablePresence().then(
	function() {
        debuglog('Create environmental sensor resource.');

		// Register sensor resource
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
				envSensorResource = resource;

				// Add event handlers for each supported request type
                resource.onretrieve(retrieveHandler);
			},
			function(error) {
				debuglog('register() resource failed with: ', error);
			});
	},
	function(error) {
		debuglog('device.enablePresence() failed with: ', error);
	}
);

// Cleanup on SIGINT
process.on('SIGINT', function() {
	debuglog('Delete environmental sensor resource.');

    if (exitId)
        return;

	// Unregister resource.
	envSensorResource.unregister().then(
		function() {
			debuglog('unregister() resource successful');
		},
		function(error) {
			debuglog('unregister() resource failed with: ', error);
		}
	);

	// Disable presence
	device.server.disablePresence().then(
		function() {
			debuglog('device.disablePresence() successful');
		},
		function(error) {
			debuglog('device.disablePresence() failed with: ', error);
		}
	);

	// Exit
    exitId = setTimeout(function() { process.exit(0); }, 1000);
});
