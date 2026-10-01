// 74HC595 via shiftOut: DATA=8, CLOCK=12, LATCH=11. Writes 0b10100101.
const int DATA = 8, CLOCK = 12, LATCH = 11;
void setup() {
  pinMode(DATA, OUTPUT); pinMode(CLOCK, OUTPUT); pinMode(LATCH, OUTPUT);
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, 0b10100101);
  digitalWrite(LATCH, HIGH);
}
void loop() {}
