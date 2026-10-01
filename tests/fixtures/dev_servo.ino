// lib_deps: arduino-libraries/Servo@^1.2.2
#include <Servo.h>
Servo s;
void setup() { s.attach(9); s.write(30); delay(600); s.write(150); }
void loop() {}
