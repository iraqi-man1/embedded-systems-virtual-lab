// LED on pin 13 follows a button on pin 2 (INPUT_PULLUP, active low).
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  bool pressed = digitalRead(2) == LOW;
  digitalWrite(13, pressed ? HIGH : LOW);
  static bool last = false;
  if (pressed != last) { Serial.println(pressed ? "DOWN" : "UP"); last = pressed; }
}
