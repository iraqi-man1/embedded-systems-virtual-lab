// HC-SR04: TRIG=9, ECHO=10; prints distance in cm.
const int TRIG = 9, ECHO = 10;
void setup() { Serial.begin(115200); pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); }
void loop() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000UL);
  Serial.print("cm="); Serial.println(us / 58.0, 1);
  delay(60);
}
