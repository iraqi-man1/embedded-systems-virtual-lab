// lib_deps: adafruit/Adafruit MPU6050, adafruit/Adafruit Unified Sensor
// Prints acceleration (m/s^2) and temperature from an MPU-6050 at 0x68.
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
Adafruit_MPU6050 mpu;
void setup() {
  Serial.begin(115200);
  if (!mpu.begin()) { Serial.println("no mpu"); for (;;) {} }
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  Serial.println("mpu ok");
}
void loop() {
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  Serial.print("ax="); Serial.print(a.acceleration.x, 2);
  Serial.print(" ay="); Serial.print(a.acceleration.y, 2);
  Serial.print(" az="); Serial.print(a.acceleration.z, 2);
  Serial.print(" gz="); Serial.print(g.gyro.z, 3);
  Serial.print(" t="); Serial.println(t.temperature, 1);
  delay(50);
}
