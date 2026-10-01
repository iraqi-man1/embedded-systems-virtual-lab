// Steps a bipolar stepper through an A4988: 100 steps one way, then 50 back.
const int STEP = 3, DIR = 4;
void pulses(int n) {
  for (int i = 0; i < n; i++) {
    digitalWrite(STEP, HIGH);
    delayMicroseconds(5);
    digitalWrite(STEP, LOW);
    delayMicroseconds(995);
  }
}
void setup() {
  pinMode(STEP, OUTPUT);
  pinMode(DIR, OUTPUT);
  Serial.begin(115200);
  digitalWrite(DIR, HIGH);
  pulses(100);
  Serial.println("fwd");
  delay(300);
  digitalWrite(DIR, LOW);
  pulses(50);
  Serial.println("back");
}
void loop() {}
