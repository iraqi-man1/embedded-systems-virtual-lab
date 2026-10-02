// Prints a banner once per (re)start: used to check board resets.
void setup() {
  Serial.begin(115200);
  Serial.println("boot");
}
void loop() {}
