// PWM on pin 9 follows the potentiometer on A0; prints the ADC reading.
void setup() { Serial.begin(115200); pinMode(9, OUTPUT); }
void loop() {
  int v = analogRead(A0);
  analogWrite(9, v / 4);
  Serial.println(v);
  delay(20);
}
