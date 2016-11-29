# JavaScript OCF servers
This folder contains JavaScript implementation of various OCF servers, such as:
* Fan
* CO2 detector
* Motion Sensor
* RGB LED
* LED (on/off)
* Buzzer
* Ambient Light Sensor
* Temperature
* Button
* Switch
* Solar Panel

# Setting up the OCF servers
## Software
All the OCF servers in these folders are written in JavaScript and leverage `iotivity-node` (IoTivity JavaScript bindings) as well as the MRAA JavaScript bindings to access and control the busses (e.g. I2C, GPIO, Analog, etc.).

* Have the HW hooked up to your board (see table below)
* Transfer the `ocf-servers` directory from this repository to your device.
* Install Node.js dependencies which are not provided by the OS (you need a live network connection).
 - `npm install uuid bindings lodash osenv sha.js shelljs`
* Start the OCF server.
 - `node js-servers/<ocf-server>.js &`
* Et voila...

## Setting up the HW devices/sensors
The connector listed below was derived from the corresponding `*.js` files. Please double-check in the code (`*.js`) in case of problems as the table may have gone out-of-sync.

| OCF server | Connector | HW device |
|------------|-----------|-----------|
| Fan | GPIO 9 | [Grove Mini Fan] (http://www.seeedstudio.com/wiki/Grove_-_Mini_Fan) |
| CO2 (carbonDioxide) | A0 analog pin | [Grove - Gas Sensor(MQ2)] (http://www.seeedstudio.com/depot/Grove-Gas-SensorMQ2-p-937.html) |
| Motion Sensor | GPIO 5 | [Grove PIR Motion Sensor] (http://www.seeedstudio.com/depot/Grove-PIR-Motion-Sensor-p-802.html) |
| RGB LED | GPIO 7 (clock) and 8 (data) | [Grove Chainable RGB LED] (http://www.seeedstudio.com/depot/twig-chainable-rgb-led-p-850.html?cPath=156_157) |
| LED | GPIO 2 | [Grove LED Socket kit] (http://www.seeedstudio.com/wiki/Grove_-_LED) |
| Buzzer | GPIO 6 | [Grove Buzzer] (http://www.seeedstudio.com/wiki/Grove_-_Buzzer) |
| Ambient Light Sensor (Illuminance) | A3 analog pin | [Grove Light Sensor] (http://www.seeedstudio.com/depot/Grove-Light-Sensor-p-746.html) |
| Temperature | A1 analog pin | [Grove Temperature Sensor] (http://www.seeedstudio.com/depot/Grove-Temperature-Sensor-p-774.html) |
| Button | GPIO 4 | [Grove Button] (http://www.seeedstudio.com/wiki/Grove_-_Button) |
| button-toggle [note] | GPIO 4 | [Grove Button] (http://www.seeedstudio.com/wiki/Grove_-_Button) |
| Switch | GPIO 4 | [Grove Switch(P)] (http://www.seeedstudio.com/wiki/Grove_-_Switch(P)) |

[note]: This is a variation of the classical `Button` implemenation in that it makes the button act as a toggle between `true` and `false` (instead of reporting `true` when pressed and `false` otherwise.

## Setting up the Smart Solar Panel
### Hardware components required
* 1x [Solar Panel]
* 1x [Line Actuator]
* 1x [Actuator Control Board]
* 1x [Grove LCD RGB panel]

### Setting up the Solar Panel HW components
1. Mount the [Solar Panel] and [Line Actuator] as shown in the following pictures (the [Actuator Control Board] is not visible in those pictures, refer to point 2 below for more details on how to connect all three components together):
![solar-panel-1](./.pics/solar-panel-1.png)
![solar-panel-2](./.pics/solar-panel-2.png)
![solar-panel-3](./.pics/solar-panel-3.png)
2. Connect the [Line Actuator] to the [Actuator Control Board] as follows: ![control-to-actuator] (./.pics/control-to-actuator.png)
3. Connect the [Actuator Control Board] to the [Intel® Edison Board for Arduino] using the `RC` connector as follows: ![control-to-edison] (./.pics/control-to-edison.png) and following the table below:

  | Actuator | Edison |
  |:---:|:---:|
  | **-** | `GND` |
  | **+** | `5V` |
  | **RC** | `Digital PWM pin 3` |

4. Connect the [Grove LCD RGB panel] to any `I2C` connector on the [Grove Base Shield] that is installed on your [Intel® Edison Board for Arduino] as highlighted in the green circle on the following picture. Please make sure that the `Vcc` power switch (highlighted in red on the picture below) on the [Grove Base Shield] is set to 5V to ensure proper operation of the [Grove LCD RGB panel].

  ![lcd-to-edison](./.pics/lcd-to-edison.png)

### Starting the Smart Solar Panel OCF server
In order to get all components to work correctly, you will also need to make sure the following JavaScript bindings are available:

| Peripheral | Node.js module |
|:---:|:---:|
| Solar Panel | `mraa` |
| LCD | `jsupm_i2clcd` |

Not having those available will disable the corresponding device and switch to simulation mode.

Once you are all set, start the OCF server as follows: **`node solar.js &`**

[Solar Panel]: http://www.adafruit.com/products/200
[Line Actuator]: http://www.robotshop.com/en/firgelli-technologies-l12-30-210-12-p.html
[Actuator Control Board]: http://www.robotshop.com/en/firgelli-technologies-linear-actuator-control-board.html
[Grove LCD RGB panel]: http://www.seeedstudio.com/wiki/Grove_-_LCD_RGB_Backlight
[Grove Base Shield]: https://www.seeedstudio.com/base-shield-v13-p-1378.html?cPath=132_134
[Intel® Edison Board for Arduino]: http://www.intel.com/content/www/us/en/support/boards-and-kits/intel-edison-boards/intel-edison-board-for-arduino.html
