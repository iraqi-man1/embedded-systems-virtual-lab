// KY-040 polled on CLK falling edges: DT HIGH = clockwise. SW uses the module pull-up.
const int CLK = 2, DT = 3, SW = 4;
int pos = 0;
int lastClk = HIGH;
void setup() {
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT);
  Serial.begin(115200);
  lastClk = digitalRead(CLK);
  Serial.println("ready");
}
void loop() {
  int clk = digitalRead(CLK);
  if (clk != lastClk && clk == LOW) {
    pos += digitalRead(DT) == HIGH ? 1 : -1;
    Serial.print("pos=");
    Serial.println(pos);
  }
  lastClk = clk;
  if (digitalRead(SW) == LOW) {
    Serial.println("click");
    while (digitalRead(SW) == LOW) {}
  }
}
