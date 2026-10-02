/**
 * Code snippets (code editor › Snippets): the small patterns embedded
 * projects keep needing, inserted at the cursor. Each one says in its first
 * comments where it goes (top of the sketch, setup(), loop()) and how to wire
 * it; the titles and descriptions are translated.
 */
import type { FirmwareLanguage } from '../core/project/firmware';
import type { MessageKey } from '../i18n';

export interface Snippet {
  id: string;
  language: FirmwareLanguage;
  title: MessageKey;
  description: MessageKey;
  /** Where it goes: with the other functions at the top level, or inside loop() / the main loop. */
  where: 'top' | 'loop';
  code: string;
}

export const SNIPPETS: Snippet[] = [
  // ------------------------------------------------------------- Arduino
  {
    id: 'debounce',
    language: 'arduino',
    title: 'Button without bounces',
    description: 'A press counts once, even though the button’s contacts bounce.',
    where: 'top',
    code: `// Button without bounces: a press counts once, even though the contacts bounce.
// Wire the button between pin 2 and GND. In setup(): pinMode(BUTTON_PIN, INPUT_PULLUP);
// In loop(): if (buttonPressed()) { ... }
const int BUTTON_PIN = 2;
int buttonState = HIGH;  // the settled state
int lastReading = HIGH;
unsigned long lastChange = 0;

bool buttonPressed() {
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastReading) {
    lastChange = millis();
    lastReading = reading;
  }
  if (millis() - lastChange > 30 && reading != buttonState) {
    buttonState = reading;
    return buttonState == LOW;  // pressed: the pull-up makes it read LOW
  }
  return false;
}`,
  },
  {
    id: 'millis-timer',
    language: 'arduino',
    title: 'Every 500 ms, without delay()',
    description: 'Repeats a task on time while loop() keeps running, so buttons still respond.',
    where: 'loop',
    code: `// Every 500 ms without delay(): loop() keeps running, so buttons and other tasks still respond.
// Put this in loop():
static unsigned long last = 0;
if (millis() - last >= 500) {
  last += 500;
  // ... what to do every 500 ms
}`,
  },
  {
    id: 'state-machine',
    language: 'arduino',
    title: 'State machine (traffic light)',
    description: 'One state at a time, changed when its time is up: green, yellow, red.',
    where: 'top',
    code: `// A state machine: the program is in one state at a time and moves on when its time is up.
// A traffic light: red on pin 11, yellow on 12, green on 13 (each LED with a resistor).
// In setup(): pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(13, OUTPUT);
// In loop(): trafficLight();
enum Light { GREEN, YELLOW, RED };
Light light = GREEN;
unsigned long since = 0;

void trafficLight() {
  unsigned long now = millis();
  switch (light) {
    case GREEN:  if (now - since > 3000) { light = YELLOW; since = now; } break;
    case YELLOW: if (now - since > 1000) { light = RED;    since = now; } break;
    case RED:    if (now - since > 3000) { light = GREEN;  since = now; } break;
  }
  digitalWrite(11, light == RED);
  digitalWrite(12, light == YELLOW);
  digitalWrite(13, light == GREEN);
}`,
  },
  {
    id: 'pwm-fade',
    language: 'arduino',
    title: 'Fade an LED (PWM)',
    description: 'analogWrite() dims an LED up and down on a PWM pin (marked ~).',
    where: 'loop',
    code: `// Fade an LED up and down with PWM, on pin 9 with a 220 Ω resistor (PWM pins: 3, 5, 6, 9, 10, 11).
// Put this in loop(); in setup(): pinMode(9, OUTPUT);
for (int b = 0; b <= 255; b += 5) { analogWrite(9, b); delay(20); }
for (int b = 255; b >= 0; b -= 5) { analogWrite(9, b); delay(20); }`,
  },
  {
    id: 'servo',
    language: 'arduino',
    title: 'Servo sweep',
    description: 'Turns a servo from 0° to 180° and back with the Servo library.',
    where: 'top',
    code: `// Sweep a servo from 0° to 180° and back; its signal wire on pin 9, power from 5 V.
// In setup(): servo.attach(9);   In loop(): sweep();
#include <Servo.h>
Servo servo;

void sweep() {
  for (int a = 0; a <= 180; a += 2) { servo.write(a); delay(15); }
  for (int a = 180; a >= 0; a -= 2) { servo.write(a); delay(15); }
}`,
  },
  {
    id: 'interrupt',
    language: 'arduino',
    title: 'React at once (interrupt)',
    description: 'A function runs the moment pin 2 changes, even during delay().',
    where: 'top',
    code: `// An interrupt runs onPress() the moment pin 2 falls (button to GND), even during delay().
// Keep it short: it only sets a flag that loop() handles.
// In setup(): pinMode(2, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(2), onPress, FALLING);
// In loop():  if (pressed) { pressed = false; ... }
volatile bool pressed = false;

void onPress() {
  pressed = true;
}`,
  },
  {
    id: 'adc-average',
    language: 'arduino',
    title: 'Smooth an analog reading',
    description: 'Averages several analogRead() values to calm a noisy sensor.',
    where: 'top',
    code: `// Average of several readings: calms a noisy sensor.
// Example: int value = readAverage(A0, 16);  // 0–1023
int readAverage(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) sum += analogRead(pin);
  return sum / samples;
}`,
  },
  {
    id: 'map-range',
    language: 'arduino',
    title: 'Reading to another range (map)',
    description: 'A potentiometer’s 0–1023 becomes an LED brightness 0–255.',
    where: 'loop',
    code: `// map() turns a reading into another range: a potentiometer on A0 (0–1023)
// sets the brightness (0–255) of an LED on pin 9. Put this in loop():
int reading = analogRead(A0);
int brightness = map(reading, 0, 1023, 0, 255);
analogWrite(9, constrain(brightness, 0, 255));`,
  },
  {
    id: 'serial-command',
    language: 'arduino',
    title: 'Commands from the Serial Monitor',
    description: 'Reads a line you type (on / off) and acts on it.',
    where: 'loop',
    code: `// Reads a line typed in the Serial Monitor (line ending: Newline) and acts on it.
// In setup(): Serial.begin(9600); pinMode(13, OUTPUT);   Put this in loop():
if (Serial.available()) {
  String command = Serial.readStringUntil('\\n');
  command.trim();
  if (command == "on") digitalWrite(13, HIGH);
  else if (command == "off") digitalWrite(13, LOW);
  else Serial.println("Type on or off");
}`,
  },

  // --------------------------------------------------------- MicroPython
  {
    id: 'debounce',
    language: 'micropython',
    title: 'Button without bounces',
    description: 'A press counts once, even though the button’s contacts bounce.',
    where: 'top',
    code: `# Button without bounces: a press counts once, even though the contacts bounce.
# Wire the button between GP14 and GND. In the main loop: if button_pressed(): ...
from machine import Pin
import time

button = Pin(14, Pin.IN, Pin.PULL_UP)
_stable = 1
_reading = 1
_changed = time.ticks_ms()


def button_pressed():
    global _stable, _reading, _changed
    r = button.value()
    if r != _reading:
        _reading = r
        _changed = time.ticks_ms()
    if r != _stable and time.ticks_diff(time.ticks_ms(), _changed) > 30:
        _stable = r
        return r == 0  # pressed: the pull-up makes it read 0
    return False`,
  },
  {
    id: 'ticks-timer',
    language: 'micropython',
    title: 'Every 500 ms, without sleep()',
    description: 'Repeats a task on time while the loop keeps running.',
    where: 'top',
    code: `# Every 500 ms without sleep(): the loop keeps running, so buttons still respond.
import time

last = time.ticks_ms()
while True:
    if time.ticks_diff(time.ticks_ms(), last) >= 500:
        last = time.ticks_add(last, 500)
        # ... what to do every 500 ms`,
  },
  {
    id: 'timer',
    language: 'micropython',
    title: 'Timer callback',
    description: 'machine.Timer calls a function on its own, here twice a second.',
    where: 'top',
    code: `# A Timer calls tick() on its own twice a second while the rest of the program goes on.
# It blinks the on-board LED (GP25).
from machine import Pin, Timer

led = Pin(25, Pin.OUT)


def tick(timer):
    led.toggle()


Timer(period=500, mode=Timer.PERIODIC, callback=tick)`,
  },
  {
    id: 'state-machine',
    language: 'micropython',
    title: 'State machine (traffic light)',
    description: 'One state at a time, changed when its time is up: green, yellow, red.',
    where: 'top',
    code: `# A state machine: one state at a time, changed when its time is up.
# A traffic light: green on GP13, yellow on GP14, red on GP15 (each LED with a resistor).
from machine import Pin
import time

lights = {"green": Pin(13, Pin.OUT), "yellow": Pin(14, Pin.OUT), "red": Pin(15, Pin.OUT)}
NEXT = {"green": ("yellow", 3000), "yellow": ("red", 1000), "red": ("green", 3000)}
state = "green"
since = time.ticks_ms()

while True:
    following, wait = NEXT[state]
    if time.ticks_diff(time.ticks_ms(), since) > wait:
        state = following
        since = time.ticks_ms()
    for name, pin in lights.items():
        pin.value(name == state)
    time.sleep_ms(10)`,
  },
  {
    id: 'pwm-fade',
    language: 'micropython',
    title: 'Fade an LED (PWM)',
    description: 'machine.PWM dims an LED up and down.',
    where: 'top',
    code: `# Fade an LED up and down with PWM (LED with a 220 Ω resistor on GP15).
from machine import Pin, PWM
import time

pwm = PWM(Pin(15))
pwm.freq(1000)
while True:
    for duty in range(0, 65536, 2048):
        pwm.duty_u16(duty)
        time.sleep_ms(20)
    for duty in range(65535, -1, -2048):
        pwm.duty_u16(duty)
        time.sleep_ms(20)`,
  },
  {
    id: 'servo',
    language: 'micropython',
    title: 'Servo to an angle',
    description: 'A 50 Hz PWM pulse of 0.5–2.5 ms sets a servo’s angle.',
    where: 'top',
    code: `# Turn a servo to an angle: a pulse of 0.5–2.5 ms every 20 ms (50 Hz), signal wire on GP16.
from machine import Pin, PWM

servo = PWM(Pin(16))
servo.freq(50)


def angle(degrees):
    pulse_us = 500 + degrees * 2000 // 180
    servo.duty_ns(pulse_us * 1000)


angle(90)`,
  },
  {
    id: 'pin-irq',
    language: 'micropython',
    title: 'React at once (Pin.irq)',
    description: 'A function runs the moment a pin falls, even while the program sleeps.',
    where: 'top',
    code: `# An interrupt calls on_press() the moment GP14 falls (button to GND), even during sleep.
# Keep the handler short: it only sets a flag the main loop handles.
from machine import Pin

pressed = False


def on_press(pin):
    global pressed
    pressed = True


button = Pin(14, Pin.IN, Pin.PULL_UP)
button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)
# In the main loop: if pressed: pressed = False; ...`,
  },
  {
    id: 'adc-average',
    language: 'micropython',
    title: 'Smooth an analog reading',
    description: 'Averages several ADC readings to calm a noisy sensor.',
    where: 'top',
    code: `# Average of several readings: calms a noisy sensor on GP26 (ADC0). 0–65535.
from machine import ADC

adc = ADC(26)


def read_average(samples=16):
    return sum(adc.read_u16() for _ in range(samples)) // samples`,
  },
  {
    id: 'i2c-scan',
    language: 'micropython',
    title: 'Find I2C devices',
    description: 'Lists the addresses of the modules on the I2C wires (an LCD answers at 0x27).',
    where: 'top',
    code: `# List the I2C modules wired to GP4 (SDA) and GP5 (SCL); an I2C LCD usually answers at 0x27.
from machine import Pin, SoftI2C

i2c = SoftI2C(sda=Pin(4), scl=Pin(5), freq=100000)
print([hex(address) for address in i2c.scan()])`,
  },
];

export const snippetsFor = (language: FirmwareLanguage) => SNIPPETS.filter((s) => s.language === language);
