// DC motor on L298N channel A: half speed forward, then full speed reverse.
const int ENA = 9, IN1 = 7, IN2 = 8;
void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  Serial.begin(115200);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  analogWrite(ENA, 128);
  Serial.println("half");
  delay(1000);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  analogWrite(ENA, 255);
  Serial.println("reverse");
}
void loop() {}
