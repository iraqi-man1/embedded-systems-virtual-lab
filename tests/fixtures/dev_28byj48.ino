// lib_deps: arduino-libraries/Stepper
// Turns a 28BYJ-48 (2048 steps/rev) a quarter turn with the Stepper library.
#include <Stepper.h>
Stepper stepper(2048, 8, 10, 9, 11); // IN1, IN3, IN2, IN4
void setup() {
  Serial.begin(115200);
  stepper.setSpeed(15);
  stepper.step(512);
  Serial.println("done");
}
void loop() {}
