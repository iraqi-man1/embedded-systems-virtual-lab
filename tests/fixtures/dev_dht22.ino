// lib_deps: adafruit/DHT sensor library@^1.4.6, adafruit/Adafruit Unified Sensor@^1.1.14
#include <DHT.h>
DHT dht(2, DHT22);
void setup() { Serial.begin(115200); dht.begin(); }
void loop() {
  delay(2100);
  float h = dht.readHumidity(), t = dht.readTemperature();
  if (isnan(h) || isnan(t)) { Serial.println("ERR"); return; }
  Serial.print("T="); Serial.print(t, 1); Serial.print(" H="); Serial.println(h, 1);
}
